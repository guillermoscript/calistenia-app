import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Calendar Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/calendar')
  })

  test('shows calendar page with month grid', async ({ page }) => {
    await expect(page.getByText(/^CALENDARIO$|^CALENDAR$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator('#tour-calendar-grid, [class*="grid-cols-7"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('shows current year', async ({ page }) => {
    await expect(page.getByText(/^CALENDARIO$|^CALENDAR$/i).first()).toBeVisible({ timeout: 8000 })
    const year = new Date().getFullYear().toString()
    await expect(page.getByText(year).first()).toBeVisible({ timeout: 5000 })
  })

  test('can navigate to previous month', async ({ page }) => {
    await expect(page.getByText(/^CALENDARIO$|^CALENDAR$/i).first()).toBeVisible({ timeout: 8000 })
    const prevBtn = page.getByRole('button', { name: /mes anterior|previous month/i })
    await expect(prevBtn).toBeVisible({ timeout: 5000 })
    await prevBtn.click()
    await expect(page.getByText(/^CALENDARIO$|^CALENDAR$/i).first()).toBeVisible()
  })

  test('can navigate to next month', async ({ page }) => {
    await expect(page.getByText(/^CALENDARIO$|^CALENDAR$/i).first()).toBeVisible({ timeout: 8000 })
    const nextBtn = page.getByRole('button', { name: /mes siguiente|next month/i })
    await expect(nextBtn).toBeVisible({ timeout: 5000 })
    await nextBtn.click()
    await expect(page.getByText(/^CALENDARIO$|^CALENDAR$/i).first()).toBeVisible()
  })

  test('TODAY button returns to current month after navigation', async ({ page }) => {
    await expect(page.getByText(/^CALENDARIO$|^CALENDAR$/i).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /mes anterior|previous month/i }).click()
    await page.getByRole('button', { name: /mes anterior|previous month/i }).click()
    await page.getByRole('button', { name: /^hoy$|^today$/i }).click()
    const year = new Date().getFullYear().toString()
    await expect(page.getByText(year).first()).toBeVisible({ timeout: 5000 })
  })

  test('shows active days count for the month', async ({ page }) => {
    await expect(page.getByText(/^CALENDARIO$|^CALENDAR$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/días activos|active days|sesiones|sessions/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
