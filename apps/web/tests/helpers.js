import { expect } from '@playwright/test'

export const TEST_PASS = 'TestPass123!'
export const TEST_NAME = 'PW Tester'

/**
 * Desactiva los overlays ANTES de que la app monte, escribiendo sus claves de
 * localStorage con `addInitScript` (corre en cada navegación, antes de los
 * scripts de la página).
 *
 * Sin esto, `InstallPrompt` monta un `setTimeout` de 5 s (no hay
 * `beforeinstallprompt` en Chromium headless, así que siempre entra por la guía
 * manual) y se pinta en `fixed bottom-4 ... z-[100]`, justo encima de
 * "SERIE COMPLETADA" y "SALTAR DESCANSO". Descartarlo a posteriori con
 * `dismissOverlays` solo funciona si el temporizador cae dentro de una de las
 * ventanas de descarte: cualquier cambio en el tiempo de arranque lo mueve
 * fuera y el prompt aparece a mitad de sesión bloqueando los clics. Eso es lo
 * que tumbó el smoke en #269, con 80 bumps de patch y ningún cambio de código.
 */
export async function suppressOverlays(page) {
  await page.addInitScript(
    (dismissKey) => {
      // El init script también corre en `about:blank`, donde tocar localStorage
      // lanza SecurityError: sin el try/catch, la excepción se propaga y la
      // navegación real se queda sin las claves.
      try {
        localStorage.setItem(dismissKey, Date.now().toString())
      } catch {
        /* origen sin storage disponible: se reintenta en la siguiente navegación */
      }
    },
    'calistenia_install_dismiss',
  )
}

/**
 * Dismiss any overlays that might block interaction (PWA install prompt, discovery survey, etc.)
 */
export async function dismissOverlays(page) {
  // 1b. Encuesta de descubrimiento (#771): sale ~4 s después de entrar y tapa
  // la página. Su clave lleva el uid, así que `suppressOverlays` no puede
  // adelantarse antes del registro; se cierra con «Ahora no».
  const surveyTitle = page.getByText(/^(Ayúdanos a mejorar Calistenia|Help us improve Calistenia)$/)
  if (await surveyTitle.isVisible({ timeout: 300 }).catch(() => false)) {
    await page.getByRole('button', { name: /^(Ahora no|Not now)$/i }).last().click().catch(() => {})
    await page.waitForTimeout(200)
  }
  // 2. Dismiss PWA install prompt via its X button (aria-label="Cerrar")
  const pwaClose = page.locator('button[aria-label="Cerrar"]').first()
  if (await pwaClose.isVisible({ timeout: 800 }).catch(() => false)) {
    await pwaClose.click().catch(() => {})
    await page.waitForTimeout(200)
    return // prompt dismissed
  }
  // Fallback: "Entendido" text button
  const entendidoBtn = page.locator('button:text-is("Entendido")').first()
  if (await entendidoBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await entendidoBtn.click().catch(() => {})
  }
}

/**
 * Register a new user, skip onboarding, and wait for the authenticated app shell.
 * Returns the generated email.
 */
export async function register(page, { email, password, name } = {}) {
  const _email =
    email || `pw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`
  const _password = password || TEST_PASS
  const _name = name || TEST_NAME

  await suppressOverlays(page)
  await page.goto('/auth?mode=signup')
  const nameField = page.getByPlaceholder(/^name$|^nombre$/i)
  await expect(nameField).toBeVisible({ timeout: 10000 })
  await nameField.fill(_name)
  await page.getByPlaceholder(/^email$/i).fill(_email)
  await page.getByPlaceholder(/^password$|^contraseña$/i).fill(_password)
  await page.getByRole('button', { name: /create account|crear cuenta/i }).click()

  // After registration, user may land on onboarding flow — skip it
  const skipBtn = page.getByText(/ya conozco la app|I already know|skip/i)
  const headerNav = page.getByTestId('app-header')
  await expect(skipBtn.or(headerNav)).toBeVisible({ timeout: 15000 })
  if (await skipBtn.isVisible()) {
    await skipBtn.click()
  }
  await expect(headerNav).toBeVisible({ timeout: 10000 })

  // Dismiss any overlays that appeared after login
  await dismissOverlays(page)
  return _email
}

/**
 * Login with an existing account.
 */
export async function login(page, email, password = TEST_PASS) {
  await suppressOverlays(page)
  await page.goto('/auth')
  const emailField = page.getByPlaceholder(/^email$/i)
  await expect(emailField).toBeVisible({ timeout: 8000 })
  await emailField.fill(email)
  await page.getByPlaceholder(/^password$|^contraseña$/i).fill(password)
  await page.getByRole('button', { name: /sign in|iniciar sesión/i }).click()
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 10000 })
  await dismissOverlays(page)
}

/**
 * Navigate to a page via direct URL and wait for the page content to load.
 * Also dismisses any overlay that might appear (including delayed ones).
 */
export async function navigateTo(page, path) {
  await page.goto(path)
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  // Wait for potential delayed overlays (install prompt, survey)
  await page.waitForTimeout(800)
  await dismissOverlays(page)
  // Check again — some prompts appear after the first dismiss
  await page.waitForTimeout(300)
  await dismissOverlays(page)
}

/**
 * Abre un día en /workout. Desde #856, `/workout` sin `?day` es la pestaña
 * Entrenar: cada día entrenable es un enlace a `/workout?day=X`, que abre la
 * vista del día con su botón ya pulsado (ya no se deselecciona al pulsarlo).
 * Si ya estás en la vista del día, cambia a ese día con su botón.
 */
export async function selectDay(page, name = /lun|mon/i) {
  const hubLink = page.locator('a[href^="/workout?day="]').filter({ hasText: name }).first()
  const dayBtn = page.getByRole('button', { name }).first()
  await expect(hubLink.or(dayBtn)).toBeVisible({ timeout: 8000 })
  if (await hubLink.isVisible()) {
    await dismissOverlays(page)
    await hubLink.click()
    await expect(page).toHaveURL(/\/workout\?day=/, { timeout: 8000 })
  }
  await expect(dayBtn).toBeVisible({ timeout: 8000 })
  if ((await dayBtn.getAttribute('aria-pressed')) !== 'true') await dayBtn.click()
  await expect(dayBtn).toHaveAttribute('aria-pressed', 'true')
}

/** Cierra sesión desde Perfil › Cuenta y privacidad (#856: salió del sidebar). */
export async function signOutFromProfile(page) {
  await navigateTo(page, '/profile')
  await page.getByRole('button', { name: /cuenta y privacidad|account & privacy/i }).click()
  await page.getByRole('button', { name: /cerrar sesión|sign out/i }).click()
}
