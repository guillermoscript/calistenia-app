import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Challenges Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/challenges')
  })

  test('shows challenges page with title', async ({ page }) => {
    await expect(page.getByText(/^DESAFÍOS$|^CHALLENGES$/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('shows create button', async ({ page }) => {
    await expect(page.getByText(/^DESAFÍOS$|^CHALLENGES$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('button', { name: /crear|create/i }).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows Active and Past filter tabs', async ({ page }) => {
    await expect(page.getByText(/^DESAFÍOS$|^CHALLENGES$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('tab', { name: /activos|active/i })
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('tab', { name: /finalizados|finished/i })
    ).toBeVisible()
  })

  test('can switch to Past tab', async ({ page }) => {
    await expect(page.getByText(/^DESAFÍOS$|^CHALLENGES$/i).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('tab', { name: /finalizados|finished/i }).click()
    await expect(
      page.getByText(/sin desafíos finalizados|no finished challenges/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('Active tab shows empty state for new user', async ({ page }) => {
    await expect(page.getByText(/^DESAFÍOS$|^CHALLENGES$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/sin desafíos activos|no active challenges|crea un desafío|create a challenge/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('create button navigates to new challenge page', async ({ page }) => {
    await expect(page.getByText(/^DESAFÍOS$|^CHALLENGES$/i).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /crear|create/i }).first().click()
    await expect(page).toHaveURL(/\/challenges\/new/, { timeout: 8000 })
  })
})
