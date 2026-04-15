import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Nutrition Page Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/nutrition')
  })

  test('shows nutrition page', async ({ page }) => {
    await expect(page.getByText(/nutrición|nutrition/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('shows nutrition goal setup or dashboard for new user', async ({ page }) => {
    await expect(
      page.getByText(/nutrición|nutrition|objetivos nutricionales|nutrition goals|calorías|calories/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('shows date navigation controls', async ({ page }) => {
    await expect(page.getByText(/nutrición|nutrition/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.locator('input[type="date"], [id="tour-nutrition-date"]').first()
    ).toBeVisible({ timeout: 8000 })
  })
})
