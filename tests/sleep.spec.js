import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Sleep Tracking Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/sleep')
  })

  test('shows sleep page', async ({ page }) => {
    await expect(page.getByText(/sueño|sueno|sleep/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('shows empty state when no sleep entries', async ({ page }) => {
    await expect(page.getByText(/sueño|sueno|sleep/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/no hay registros|no sleep entries|empieza a registrar|start tracking/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows register sleep button', async ({ page }) => {
    await expect(page.getByText(/sueño|sueno|sleep/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('button', { name: /registrar|log sleep/i }).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('register button opens sleep form dialog', async ({ page }) => {
    await expect(page.getByText(/sueño|sueno|sleep/i).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /registrar|log sleep/i }).first().click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByText(/calidad|quality|hora de dormir|bedtime|cómo dormiste|how did you sleep/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows log sleep prompt for last night', async ({ page }) => {
    await expect(page.getByText(/sueño|sueno|sleep/i).first()).toBeVisible({ timeout: 8000 })
    // New user sees prompt to log last night's sleep
    await expect(
      page.getByText(/log sleep|registrar sueño|how did you sleep|cómo dormiste/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows history section', async ({ page }) => {
    await expect(page.getByText(/sueño|sueno|sleep/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/historial|history/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
