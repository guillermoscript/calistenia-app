import { expect } from '@playwright/test'

export const TEST_PASS = 'TestPass123!'
export const TEST_NAME = 'PW Tester'

/**
 * Dismiss any overlays that might block interaction (app tour, PWA install prompt, etc.)
 */
export async function dismissOverlays(page) {
  // 1. Dismiss app tour overlay first (Driver.js) — it blocks everything underneath
  for (let i = 0; i < 15; i++) {
    const doneBtn = page.locator('.driver-popover-close-btn[data-button="done"]').first()
    const nextBtn = page.locator('.driver-popover-next-btn').first()
    const closeBtn = page.locator('.driver-popover-close-btn').first()
    if (await doneBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await doneBtn.click()
      await page.waitForTimeout(200)
      break
    }
    if (await nextBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await nextBtn.click()
      await page.waitForTimeout(200)
      continue
    }
    if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
      await closeBtn.click()
      await page.waitForTimeout(200)
      break
    }
    break
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

  await page.goto('/auth?mode=signup')
  const nameField = page.getByPlaceholder(/^name$|^nombre$/i)
  await expect(nameField).toBeVisible({ timeout: 10000 })
  await nameField.fill(_name)
  await page.getByPlaceholder(/^email$/i).fill(_email)
  await page.getByPlaceholder(/^password$|^contraseña$/i).fill(_password)
  await page.getByRole('button', { name: /create account|crear cuenta/i }).click()

  // After registration, user may land on onboarding flow — skip it
  const skipBtn = page.getByText(/ya conozco la app|I already know|skip/i)
  const headerNav = page.locator('header nav')
  await expect(skipBtn.or(headerNav)).toBeVisible({ timeout: 15000 })
  if (await skipBtn.isVisible()) {
    await skipBtn.click()
  }
  await expect(headerNav).toBeVisible({ timeout: 10000 })

  // Mark all tours as seen to prevent tour overlays from blocking tests
  await page.evaluate(() => {
    // Get the user ID from PocketBase auth store
    let userId = ''
    try {
      const pbAuth = localStorage.getItem('pocketbase_auth')
      if (pbAuth) {
        const parsed = JSON.parse(pbAuth)
        userId = parsed?.record?.id || parsed?.model?.id || ''
      }
    } catch {}
    const pages = ['dashboard','workout','workout-detail','progress','nutrition','calendar','sleep',
      'programs','exercises','free-session','cardio','friends','leaderboard',
      'challenges','notifications','profile','lumbar']
    pages.forEach(p => {
      localStorage.setItem(`calistenia_tour_${p}`, 'true')
      if (userId) localStorage.setItem(`calistenia_tour_${p}_${userId}`, 'true')
    })
  })

  // Dismiss any overlays that appeared after login
  await dismissOverlays(page)
  return _email
}

/**
 * Login with an existing account.
 */
export async function login(page, email, password = TEST_PASS) {
  await page.goto('/auth')
  const emailField = page.getByPlaceholder(/^email$/i)
  await expect(emailField).toBeVisible({ timeout: 8000 })
  await emailField.fill(email)
  await page.getByPlaceholder(/^password$|^contraseña$/i).fill(password)
  await page.getByRole('button', { name: /sign in|iniciar sesión/i }).click()
  await expect(page.locator('header nav')).toBeVisible({ timeout: 10000 })
  await dismissOverlays(page)
}

/**
 * Navigate to a page via direct URL and wait for the page content to load.
 * Also dismisses any overlay that might appear (including delayed ones).
 */
export async function navigateTo(page, path) {
  await page.goto(path)
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  // Wait for potential delayed overlays (tours start after a brief delay)
  await page.waitForTimeout(800)
  await dismissOverlays(page)
  // Check again — some tours/prompts appear after the first dismiss
  await page.waitForTimeout(300)
  await dismissOverlays(page)
}
