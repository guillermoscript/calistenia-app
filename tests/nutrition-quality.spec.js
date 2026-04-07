import { test, expect } from '@playwright/test'
import { register, navigateTo, dismissOverlays } from './helpers.js'
import path from 'path'

/**
 * Navigate through the 6-step nutrition goal wizard.
 */
async function setupNutritionGoals(page) {
  const weight = page.getByRole('spinbutton', { name: /weight|peso/i })
  const height = page.getByRole('spinbutton', { name: /height|altura|estatura/i })
  const age = page.getByRole('spinbutton', { name: /age|edad/i })

  if (await weight.isVisible({ timeout: 3000 }).catch(() => false)) {
    await weight.fill('75')
    await height.fill('178')
    await age.fill('30')
  } else {
    const inputs = page.locator('input[type="number"]')
    const count = await inputs.count()
    if (count >= 3) {
      await inputs.nth(0).fill('75')
      await inputs.nth(1).fill('178')
      await inputs.nth(2).fill('30')
    }
  }

  const nextBtn = page.getByRole('button', { name: 'NEXT', exact: true })
  for (let step = 0; step < 5; step++) {
    await nextBtn.click()
    await page.waitForTimeout(400)
  }

  const saveBtn = page.getByRole('button', { name: /save|guardar|confirmar/i })
  await expect(saveBtn).toBeVisible({ timeout: 5000 })
  await saveBtn.click()
  await page.waitForTimeout(1000)
  await dismissOverlays(page)
}

test.describe('Nutrition Quality Scoring via Image Analysis', () => {
  test.setTimeout(180_000)

  test('photo analysis returns quality score and displays it on meal card', async ({ page }) => {
    // Track API calls
    const apiCalls = []
    page.on('response', async (res) => {
      const url = res.url()
      if (url.includes('/api/') || url.includes('nutrition_entries')) {
        apiCalls.push({ url, status: res.status(), method: res.request().method() })
      }
    })

    // 1. Register and navigate to nutrition
    await register(page)
    await navigateTo(page, '/nutrition')

    // 2. Set up nutrition goals if needed
    const goalSetup = page.getByText(/nutrition goals|objetivos nutricionales/i).first()
    const dashboardEl = page.locator('[id="tour-nutrition-dashboard"]').first()
    await expect(goalSetup.or(dashboardEl)).toBeVisible({ timeout: 10000 })

    if (await goalSetup.isVisible().catch(() => false)) {
      await setupNutritionGoals(page)
    }

    await expect(dashboardEl).toBeVisible({ timeout: 10000 })

    // 3. Click FAB
    const addBtn = page.locator('button[aria-label="Log meal"], button[aria-label="Registrar comida"]').first()
    await expect(addBtn).toBeVisible({ timeout: 8000 })
    await addBtn.click()
    await page.waitForTimeout(1000)
    await dismissOverlays(page)

    // 4. Upload test image
    const imagePath = path.resolve('pan.jpg')
    const fileInput = page.locator('input[type="file"][accept*="image"]').first()
    await fileInput.setInputFiles(imagePath)
    await page.waitForTimeout(1500)

    // 5. Add description
    const descInput = page.locator('textarea, input[placeholder*="descri"], input[placeholder*="Descri"]').first()
    if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descInput.fill('4 sandwich de huevos revueltos con queso y jamón')
    }

    // 6. Click analyze
    const analyzeBtn = page.getByRole('button', { name: /analizar|analyze/i }).first()
    if (await analyzeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click()
    }

    // 7. Wait for "SAVE MEAL" button (analysis complete, review step)
    console.log('Waiting for AI analysis...')
    const saveButton = page.getByRole('button', { name: /SAVE MEAL|GUARDAR COMIDA/i })
    await expect(saveButton).toBeVisible({ timeout: 120_000 })

    await page.screenshot({ path: 'tests/screenshots/nq-04-review.png' })

    // 8. Clear API tracking and save
    apiCalls.length = 0
    await saveButton.click()

    // 9. Wait for success screen
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'tests/screenshots/nq-05-after-save.png' })

    // Check what API calls were made during save
    console.log('API calls during save:')
    for (const call of apiCalls) {
      console.log(`  ${call.method} ${call.url} → ${call.status}`)
    }

    // 10. Look for the success step
    const successStep = page.getByText(/guardad|saved|registrad|éxito|success|750|kcal/i).first()
    await expect(successStep).toBeVisible({ timeout: 10000 })

    // Check for "log another" or close button
    const closeOrAnother = page.locator('button:has-text("Log another"), button:has-text("Registrar otra"), button:has-text("Close"), button:has-text("Cerrar"), button[aria-label="Close"]').first()
    const hasCloseBtn = await closeOrAnother.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Close/another button visible: ${hasCloseBtn}`)

    // Try to close the modal if it's still open
    if (hasCloseBtn) {
      await closeOrAnother.click()
      await page.waitForTimeout(1000)
    } else {
      // Click the X button on the dialog
      const xBtn = page.locator('[class*="dialog"] button[class*="close"], .fixed button:has(svg)').first()
      if (await xBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await xBtn.click()
        await page.waitForTimeout(1000)
      }
    }

    await page.screenshot({ path: 'tests/screenshots/nq-06-modal-closed.png' })

    // 11. Reload the page to refresh data
    await page.reload()
    await page.waitForTimeout(3000)
    await dismissOverlays(page)

    await page.screenshot({ path: 'tests/screenshots/nq-07-dashboard-reloaded.png', fullPage: true })

    // 12. Scroll down to meal cards area
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'tests/screenshots/nq-08-scrolled.png', fullPage: true })

    // Check for quality score letter (A-E) in meal card area
    // The score badge is a <span> (not button) with the score letter
    const bodyText = await page.locator('body').innerText()
    const mealSection = bodyText.split(/DAY.S MEALS|COMIDAS DEL D/i)[1]?.slice(0, 500) || ''
    console.log('Meal section text:', mealSection)

    // Score should appear as a single letter A-E in the meal card
    const hasQualityScore = /\b[A-E]\b/.test(mealSection)
    console.log(`Quality score found in meal section: ${hasQualityScore}`)

    // Also check via aria-label for the score badge (button variant) or span variant
    const scoreBadge = page.locator('[aria-label*="Score"], span:text-matches("^[A-E]$")').first()
    const hasBadge = await scoreBadge.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Score badge element visible: ${hasBadge}`)

    expect(hasQualityScore || hasBadge).toBeTruthy()
  })
})
