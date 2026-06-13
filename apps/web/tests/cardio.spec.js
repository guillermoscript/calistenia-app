import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Cardio Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/cardio')
  })

  test('shows cardio page with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CARDIO' })).toBeVisible({ timeout: 8000 })
  })

  test('shows activity type options', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CARDIO' })).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/^Running$|^Carrera$/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/^Walking$|^Caminata$/i).first()).toBeVisible()
    await expect(page.getByText(/^Cycling$|^Ciclismo$/i).first()).toBeVisible()
  })

  test('shows start button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CARDIO' })).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('button', { name: /iniciar|start/i }).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows empty history for new user', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CARDIO' })).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/no hay sesiones|no cardio sessions/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
