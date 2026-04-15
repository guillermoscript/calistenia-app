import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Friends & Social Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/friends')
  })

  test('shows friends page with title', async ({ page }) => {
    await expect(page.getByText(/^AMIGOS$|^FRIENDS$/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('shows search input', async ({ page }) => {
    await expect(page.getByText(/^AMIGOS$|^FRIENDS$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.locator('input[placeholder*="Buscar amigos" i], input[placeholder*="Search friends" i]').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows Following and Followers tabs', async ({ page }) => {
    await expect(page.getByText(/^AMIGOS$|^FRIENDS$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('tab', { name: /siguiendo|following/i })
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('tab', { name: /seguidores|followers/i })
    ).toBeVisible()
  })

  test('can switch to Followers tab', async ({ page }) => {
    await expect(page.getByText(/^AMIGOS$|^FRIENDS$/i).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('tab', { name: /seguidores|followers/i }).click()
    await expect(
      page.getByText(/no tienes seguidores|no followers|comparte tu perfil|share your profile/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('Following tab shows empty state for new user', async ({ page }) => {
    await expect(page.getByText(/^AMIGOS$|^FRIENDS$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/no sigues a nadie|not following anyone/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows share/invite section', async ({ page }) => {
    await expect(page.getByText(/^AMIGOS$|^FRIENDS$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/invita|invite|compartir|share|whatsapp/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
