import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

test.describe('Notifications Journey', () => {
  test.beforeEach(async ({ page }) => {
    await register(page)
    await navigateTo(page, '/notifications')
  })

  test('shows notifications page with title', async ({ page }) => {
    await expect(page.getByText(/^NOTIFICACIONES$|^NOTIFICATIONS$/i).first()).toBeVisible({ timeout: 8000 })
  })

  test('shows empty state for new user', async ({ page }) => {
    await expect(page.getByText(/^NOTIFICACIONES$|^NOTIFICATIONS$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText(/sin notificaciones|no notifications/i).first()
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByText(/cuando alguien interactúe|when someone interacts/i).first()
    ).toBeVisible()
  })

  test('mark all read button is hidden when no unread notifications', async ({ page }) => {
    await expect(page.getByText(/^NOTIFICACIONES$|^NOTIFICATIONS$/i).first()).toBeVisible({ timeout: 8000 })
    // When there are no notifications, mark all read button should NOT be visible
    await expect(
      page.getByRole('button', { name: /marcar todas|mark all/i })
    ).not.toBeVisible()
  })
})
