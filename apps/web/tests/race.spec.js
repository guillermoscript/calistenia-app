import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Race Feature — smoke', () => {
  // El diálogo de crear carrera (mapa + GPS + form) es más alto que el
  // viewport por defecto (720px) y no tiene scroll interno: el submit queda
  // fuera y Playwright no puede clickarlo. Viewport alto para todo el spec.
  test.use({ viewport: { width: 1280, height: 1600 } })

  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/cardio')
  })

  test('create race dialog opens with mode picker', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CARDIO' })).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /crear competencia|create race/i }).first().click()
    await expect(page.getByRole('button', { name: /DISTANCIA|DISTANCE/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /TIEMPO|TIME/i })).toBeVisible()
  })

  test('creating a distance race navigates to lobby', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CARDIO' })).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /crear competencia|create race/i }).first().click()
    await page.getByPlaceholder(/nombre de la carrera|race name/i).fill('Smoke Race')
    // DISTANCIA is default — fill target km
    await page.getByPlaceholder('5.0').fill('1.5')
    // El diálogo es más alto que el viewport (mapa + GPS): scroll al submit.
    const submitBtn = page.getByRole('button', { name: /crear competencia|create race/i }).last()
    await submitBtn.scrollIntoViewIfNeeded()
    await submitBtn.click()
    // Expect redirect to /race/:id and lobby
    await expect(page).toHaveURL(/\/race\/[a-z0-9]+/i, { timeout: 5000 })
    await expect(page.getByText('Smoke Race')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/esperando participantes|waiting/i).first()).toBeVisible()
  })

  test('time mode picker switches to minutes input', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CARDIO' })).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /crear competencia|create race/i }).first().click()
    await page.getByRole('button', { name: /TIEMPO|TIME/i }).click()
    await expect(page.getByPlaceholder('20')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/MINUTOS|MINUTES/i)).toBeVisible()
  })

  test('race not found renders fallback', async ({ page }) => {
    await page.goto('/race/nonexistent123')
    await expect(page.getByText(/carrera no encontrada|race not found/i)).toBeVisible({ timeout: 8000 })
  })
})
