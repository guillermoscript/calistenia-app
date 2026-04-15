import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Free Session Builder Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/free-session')
  })

  test('shows free session page with exercise catalog', async ({ page }) => {
    await expect(page.getByText(/modo libre|free mode|arma tu sesión|build your session/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.locator('input[placeholder*="Buscar" i], input[placeholder*="Search" i]').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows category filter buttons', async ({ page }) => {
    await expect(page.getByText(/modo libre|free mode|arma tu sesión|build your session/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('button', { name: /^Push$/i }).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /^Pull$/i }).first()).toBeVisible()
  })

  test('search filters exercises in catalog', async ({ page }) => {
    await expect(page.getByText(/modo libre|free mode/i).first()).toBeVisible({ timeout: 8000 })
    const searchInput = page.locator('input[placeholder*="Buscar" i], input[placeholder*="Search" i]').first()
    await searchInput.fill('plank')
    await expect(page.getByText(/plank/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('selecting an exercise updates the bottom bar', async ({ page }) => {
    await expect(page.getByText(/modo libre|free mode/i).first()).toBeVisible({ timeout: 8000 })
    const exerciseItem = page.locator('[role="listitem"]').first()
    await expect(exerciseItem).toBeVisible({ timeout: 5000 })
    await exerciseItem.click()
    // Bottom bar should update with count
    await expect(
      page.getByText(/1 ejercicio|1 exercise/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('selecting multiple exercises accumulates count', async ({ page }) => {
    await expect(page.getByText(/modo libre|free mode/i).first()).toBeVisible({ timeout: 8000 })
    const items = page.locator('[role="listitem"]')
    await expect(items.first()).toBeVisible({ timeout: 5000 })
    await items.nth(0).click()
    await items.nth(1).click()
    await items.nth(2).click()
    await expect(
      page.getByText(/3 ejercicio|3 exercise/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
