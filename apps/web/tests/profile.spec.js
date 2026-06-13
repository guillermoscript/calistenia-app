import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Profile Management Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/profile')
  })

  test('shows profile page with personal info form', async ({ page }) => {
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator('#profile-name')).toBeVisible()
    await expect(page.locator('#profile-weight')).toBeVisible()
    await expect(page.locator('#profile-height')).toBeVisible()
  })

  test('name field is pre-filled with registration name', async ({ page }) => {
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    const nameInput = page.locator('#profile-name')
    await expect(nameInput).toHaveValue('PW Tester', { timeout: 5000 })
  })

  test('can edit weight and height and see BMI', async ({ page }) => {
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    await page.locator('#profile-weight').fill('75')
    await page.locator('#profile-height').fill('175')
    await expect(page.getByText(/IMC|BMI/i)).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/Normal/i).first()).toBeVisible()
  })

  test('level selector buttons toggle correctly', async ({ page }) => {
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    const intermedioBtn = page.getByRole('button', { name: /intermedio|intermediate/i })
    await expect(intermedioBtn).toBeVisible({ timeout: 5000 })
    await intermedioBtn.click()
    await expect(intermedioBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 3000 })
  })

  test('save changes button shows success feedback', async ({ page }) => {
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    await page.locator('#profile-name').fill('Updated Name')
    await page.locator('#profile-weight').fill('80')
    await page.getByRole('button', { name: /guardar cambios|save changes/i }).click()
    await expect(
      page.getByText(/guardado|saved/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('profile data persists after page reload', async ({ page }) => {
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    await page.locator('#profile-weight').fill('82')
    await page.locator('#profile-height').fill('180')
    await page.getByRole('button', { name: /guardar cambios|save changes/i }).click()
    await expect(page.getByText(/guardado|saved/i).first()).toBeVisible({ timeout: 8000 })

    await page.reload()
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator('#profile-weight')).toHaveValue('82', { timeout: 5000 })
    await expect(page.locator('#profile-height')).toHaveValue('180')
  })

  test('shows account section with email and member since', async ({ page }) => {
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/^email$/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/miembro desde|member since/i).first()).toBeVisible()
  })

  test('reminders card is visible', async ({ page }) => {
    await expect(page.getByText(/^PERFIL$|^PROFILE$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/recordatorios|reminders/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
