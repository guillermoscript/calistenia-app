import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Leaderboard Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/leaderboard')
  })

  test('shows leaderboard page with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'RANKING' })).toBeVisible({ timeout: 8000 })
  })

  test('shows category pills', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'RANKING' })).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('button', { name: /^sesiones$|^sessions$/i }).first()
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('button', { name: /^racha$|^streak$/i }).first()
    ).toBeVisible()
  })

  test('can switch between category pills', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'RANKING' })).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /^racha$|^streak$/i }).first().click()
    await expect(page.getByRole('heading', { name: 'RANKING' })).toBeVisible()
  })

  test('shows time filter for sessions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'RANKING' })).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /^sesiones$|^sessions$/i }).first().click()
    await expect(
      page.getByRole('button', { name: /esta semana|this week/i }).first()
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('button', { name: /este mes|this month/i }).first()
    ).toBeVisible()
  })

  test('shows empty state for new user', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'RANKING' })).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/sigue a tus amigos|follow friends to see/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
