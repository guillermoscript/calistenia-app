import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Programs Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/programs')
  })

  test('shows programs page with title and search', async ({ page }) => {
    await expect(page.getByText(/^PROGRAMAS$|^PROGRAMS$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.locator('input[placeholder*="Buscar programas" i], input[placeholder*="Search programs" i]').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows create program button', async ({ page }) => {
    await expect(page.getByText(/^PROGRAMAS$|^PROGRAMS$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('button', { name: /crear programa|create program/i })
    ).toBeVisible({ timeout: 5000 })
  })

  test('program card shows use or active button', async ({ page }) => {
    await expect(page.getByText(/^PROGRAMAS$|^PROGRAMS$/i).first()).toBeVisible({ timeout: 8000 })
    const actionBtn = page.getByRole('button', { name: /usar este programa|use this program|activo|active/i }).first()
    await expect(actionBtn).toBeVisible({ timeout: 8000 })
  })

  test('create program button navigates to new program page', async ({ page }) => {
    await expect(page.getByText(/^PROGRAMAS$|^PROGRAMS$/i).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /crear programa|create program/i }).click()
    await expect(page).toHaveURL(/\/programs\/new/, { timeout: 8000 })
  })
})
