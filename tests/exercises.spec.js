import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Exercise Library Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/exercises')
  })

  test('shows exercise library page with title and search', async ({ page }) => {
    await expect(page.getByText(/^EJERCICIOS$|^EXERCISES$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.locator('input[placeholder*="Buscar" i], input[placeholder*="Search" i]').first()
    ).toBeVisible()
  })

  test('shows category filter buttons', async ({ page }) => {
    await expect(page.getByText(/^EJERCICIOS$|^EXERCISES$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('button', { name: /^Push$/i }).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /^Pull$/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Core$/i }).first()).toBeVisible()
  })

  test('search filters exercises by name', async ({ page }) => {
    await expect(page.getByText(/^EJERCICIOS$|^EXERCISES$/i).first()).toBeVisible({ timeout: 8000 })
    const searchInput = page.locator('input[placeholder*="Buscar" i], input[placeholder*="Search" i]').first()
    await searchInput.fill('push')
    await expect(page.getByText(/push/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('category filter updates exercise list', async ({ page }) => {
    await expect(page.getByText(/^EJERCICIOS$|^EXERCISES$/i).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /^Pull$/i }).first().click()
    await page.waitForTimeout(500)
    await expect(page.getByText(/pull|row|dominada/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('clicking an exercise navigates to detail page', async ({ page }) => {
    await expect(page.getByText(/^EJERCICIOS$|^EXERCISES$/i).first()).toBeVisible({ timeout: 8000 })
    // Exercise cards are <button> elements inside the grid
    const firstCard = page.locator('#tour-exercise-grid button').first()
    await expect(firstCard).toBeVisible({ timeout: 5000 })
    await firstCard.click()
    await expect(page).toHaveURL(/\/exercises\//, { timeout: 8000 })
  })
})
