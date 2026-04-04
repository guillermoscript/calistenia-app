import { test, expect } from '@playwright/test'

const TEST_PASS = 'TestPass123!'
const TEST_NAME = 'PW Tester'

async function register(page) {
  const email = `pw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`
  await page.goto('/')
  await page.getByRole('button', { name: /registrarse/i }).click()
  await page.getByPlaceholder('Guillermo').fill(TEST_NAME)
  await page.getByPlaceholder('tu@email.com').fill(email)
  await page.getByPlaceholder(/mínimo 8/i).fill(TEST_PASS)
  await page.getByRole('button', { name: /crear cuenta/i }).click()
  await expect(page.locator('header nav')).toBeVisible({ timeout: 15000 })
  return email
}

test.describe('Log Past Workout', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
  })

  test('quick action card visible on dashboard', async ({ page }) => {
    await page.goto('/')
    // The dashboard quick action card should be visible
    await expect(
      page.getByText(/log past workout|registrar entreno/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('navigates to /log-workout from dashboard card', async ({ page }) => {
    await page.goto('/')
    await page.getByText(/log past workout|registrar entreno/i).first().click()
    await expect(page).toHaveURL(/\/log-workout/, { timeout: 8000 })
  })

  test('log-workout page renders date picker and type toggle', async ({ page }) => {
    await page.goto('/log-workout')
    // Date input
    await expect(page.locator('input[type="date"]')).toBeVisible({ timeout: 8000 })
    // Session type buttons
    await expect(page.getByRole('button', { name: /free|libre/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /program|programa/i }).first()).toBeVisible()
  })

  test('program type shows phase and day selectors', async ({ page }) => {
    await page.goto('/log-workout')
    await page.getByRole('button', { name: /program|programa/i }).first().click()
    // Phase selector
    await expect(page.getByRole('button', { name: /F1/i }).first()).toBeVisible({ timeout: 5000 })
    // Day buttons
    await expect(page.getByRole('button', { name: /lun|mon/i }).first()).toBeVisible({ timeout: 5000 })
  })

  test('can search and add an exercise', async ({ page }) => {
    await page.goto('/log-workout')
    const searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="Buscar" i], input[placeholder*="ejercicio" i], input[placeholder*="exercise" i]').first()
    await searchInput.fill('push')
    // Dropdown should appear with results
    await expect(page.locator('text=/push/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('can add a custom exercise not in catalog', async ({ page }) => {
    await page.goto('/log-workout')
    const searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="Buscar" i], input[placeholder*="ejercicio" i], input[placeholder*="exercise" i]').first()
    const customName = 'My Custom Move XYZ'
    await searchInput.fill(customName)
    // Click the "Add: ..." option
    await expect(page.locator(`text=/${customName}/i`).first()).toBeVisible({ timeout: 5000 })
    await page.locator(`text=/${customName}/i`).first().click()
    // Exercise block should appear
    await expect(page.getByText(customName)).toBeVisible({ timeout: 3000 })
  })

  test('can fill in sets and save a free workout for yesterday', async ({ page }) => {
    await page.goto('/log-workout')

    // Set date to yesterday
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yStr = yesterday.toISOString().split('T')[0]
    await page.locator('input[type="date"]').fill(yStr)

    // Add custom exercise
    const searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="Buscar" i], input[placeholder*="ejercicio" i], input[placeholder*="exercise" i]').first()
    await searchInput.fill('Push-up test')
    await page.locator('text=/Push-up test/i').first().click()
    await expect(page.getByText('Push-up test')).toBeVisible()

    // Fill reps
    const repsInput = page.locator('input[placeholder*="Rep" i]').first()
    await repsInput.fill('10')

    // Add note
    const textarea = page.locator('textarea').first()
    await textarea.fill('Felt great!')

    // Save
    await page.getByRole('button', { name: /save workout|guardar entreno/i }).click()

    // Should navigate away (success toast or redirect)
    await expect(page).not.toHaveURL(/\/log-workout/, { timeout: 8000 })
  })

  test('shows error toast when no exercises added and save clicked', async ({ page }) => {
    await page.goto('/log-workout')
    await page.getByRole('button', { name: /save workout|guardar entreno/i }).click()
    await expect(
      page.getByText(/at least one exercise|al menos un ejercicio/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('log-workout appears in sidebar nav', async ({ page }) => {
    await page.goto('/')
    // Open sidebar if needed (hamburger or sidebar trigger)
    const sidebarTrigger = page.locator('[data-testid="sidebar-trigger"], button[aria-label*="sidebar" i], button[aria-label*="menu" i]').first()
    if (await sidebarTrigger.isVisible()) await sidebarTrigger.click()
    await expect(
      page.getByText(/log past workout|registrar entreno/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
