import { test, expect } from '@playwright/test'
import { register, navigateTo } from './helpers.js'

/**
 * Golden paths de la despensa (F1-F5 de la epic #153, port web #191) + recetas
 * favoritas (#179).
 *
 * Los endpoints de IA síncronos (/api/pantry/parse, /api/pantry/parse-receipt,
 * /api/generate-pantry-plan) NO pasan por el mock de :3001 (el proxy de Vite
 * solo manda /api/jobs y compañía): se stubbean con page.route, que además
 * funciona igual contra el bundle de preview en CI (donde el AI API URL va
 * baked a prod). El ciclo de compra (F2) y el CRUD manual (F1) son 100%
 * deterministas, sin IA.
 *
 * Fuera de alcance: el plan SEMANAL desde despensa (job async) — el cliente
 * solo observa el status del job y lee el plan que el worker real persiste en
 * weekly_meal_plans; testearlo requiere seed de ese plan, no un stub.
 */
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'

// Los diálogos de despensa usan max-h-[85vh] con scroll interno: viewport alto
// para que los botones de confirmación queden visibles (patrón de race.spec).
test.use({ viewport: { width: 1280, height: 1600 } })

/** Token + userId del authStore persistido. */
async function pbAuth(page) {
  return page.evaluate(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('pocketbase_auth') || '{}')
      return { token: parsed?.token || '', userId: parsed?.record?.id || parsed?.model?.id || '' }
    } catch {
      return { token: '', userId: '' }
    }
  })
}

/** Cuenta registros de una colección del usuario autenticado vía REST. */
async function pbCount(request, { token }, collection, filter) {
  const res = await request.get(`${PB_URL}/api/collections/${collection}/records`, {
    headers: { Authorization: token },
    params: { perPage: 1, filter },
  })
  if (!res.ok()) return -1
  return (await res.json()).totalItems
}

/** Añade un item por la vía manual (sin IA): Plus → dialog → Confirmar. */
async function addItemManual(page, name, { qty, price } = {}) {
  await page.getByRole('button', { name: /Agregar manual|Manual add/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Agregar a la despensa|Add to pantry/i)).toBeVisible({ timeout: 5000 })
  await dialog.getByPlaceholder(/nombre del alimento|food name/i).fill(name)
  if (qty != null) await dialog.getByPlaceholder('—').fill(String(qty))
  if (price != null) await dialog.getByPlaceholder('$', { exact: true }).fill(String(price))
  const confirmBtn = dialog.getByRole('button', { name: /^(Confirmar|Confirm)$/i })
  await expect(confirmBtn).toBeEnabled({ timeout: 5000 })
  await confirmBtn.click()
  await expect(dialog).toBeHidden({ timeout: 10000 })
  // Esperar la fila (post-refetch) antes de seguir interactuando: la tabla se
  // re-renderiza al invalidarse la query y un click inmediato puede perderse.
  await expect(page.getByText(new RegExp(`^${name}$`, 'i')).first()).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(400)
}

/**
 * Abre el diálogo de edición clicando la FILA de la tabla. Ojo: los chips de
 * "Recientes" son <button> nativos con el mismo nombre y reabren el diálogo de
 * alta (quickReAdd) — la fila es div[role="button"], por eso el selector CSS.
 */
async function openItemRow(page, name) {
  const row = page.locator('div[role="button"]').filter({ hasText: new RegExp(name, 'i') }).first()
  await expect(row).toBeVisible({ timeout: 8000 })
  await row.click()
  await expect(page.getByRole('dialog').getByText(/Editar item|Edit item/i)).toBeVisible({ timeout: 5000 })
}

test.describe('Despensa F1: inventario', () => {
  test('estado vacío → alta manual → persistida con su evento add', async ({ page, request }) => {
    test.setTimeout(90_000)
    await register(page)
    await navigateTo(page, '/pantry')

    await expect(page.getByText(/DESPENSA VACÍA|EMPTY PANTRY/i)).toBeVisible({ timeout: 8000 })

    await addItemManual(page, 'Pollo', { qty: 2, price: 8 })
    await expect(page.getByText(/^Pollo$/i).first()).toBeVisible({ timeout: 8000 })

    const auth = await pbAuth(page)
    expect(
      await pbCount(request, auth, 'pantry_items', `user='${auth.userId}' && name_normalized='pollo' && status='active'`),
      'el item no quedó en pantry_items',
    ).toBe(1)
    expect(
      await pbCount(request, auth, 'pantry_events', `user='${auth.userId}' && type='add'`),
      'falta el pantry_event de tipo add (regla de oro: todo cambio escribe evento)',
    ).toBe(1)
  })

  test('editar cantidad y borrar item', async ({ page, request }) => {
    test.setTimeout(90_000)
    await register(page)
    await navigateTo(page, '/pantry')
    await addItemManual(page, 'Arroz', { qty: 1 })

    // Editar: click en la fila → dialog → nueva cantidad → Guardar
    await openItemRow(page, 'Arroz')
    const editDialog = page.getByRole('dialog')
    // Sin htmlFor en los labels: cantidad y precio son los dos inputs con
    // placeholder "—", en ese orden
    await editDialog.getByPlaceholder('—').first().fill('5')
    await editDialog.getByRole('button', { name: /^(Guardar|Save)$/i }).click()
    await expect(editDialog).toBeHidden({ timeout: 8000 })

    const auth = await pbAuth(page)
    expect(
      await pbCount(request, auth, 'pantry_items', `user='${auth.userId}' && name_normalized='arroz' && quantity=5`),
      'la cantidad editada no se persistió',
    ).toBe(1)

    // Borrar: X de la fila → confirm dialog → Eliminar
    await page.getByRole('button', { name: /^(Eliminar|Delete)$/i }).first().click()
    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog.getByText(/¿Eliminar item\?|Delete item\?/i)).toBeVisible({ timeout: 5000 })
    await confirmDialog.getByRole('button', { name: /^(Eliminar|Delete)$/i }).click()

    await expect(page.getByText(/DESPENSA VACÍA|EMPTY PANTRY/i)).toBeVisible({ timeout: 8000 })
    expect(
      await pbCount(request, auth, 'pantry_items', `user='${auth.userId}'`),
      'el item borrado sigue en PB',
    ).toBe(0)
  })

  test('alta por chat con parse de IA stubbeado', async ({ page }) => {
    test.setTimeout(90_000)
    await register(page)
    await page.route('**/api/pantry/parse', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          intent: 'add',
          items: [{
            name: 'Pollo', name_normalized: 'pollo', category: 'proteina',
            quantity: 2, unit: 'kg', price_total: 8, expiry_days: 5, confidence: 'high',
          }],
          reply: 'Agregué pollo a tu despensa.',
          model_used: 'mock-e2e',
        }),
      }),
    )
    await navigateTo(page, '/pantry')

    await page.getByPlaceholder(/compré 2kg|bought 2kg/i).fill('compré 2kg de pollo por 8$')
    await page.getByPlaceholder(/compré 2kg|bought 2kg/i).press('Enter')

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Agregar a la despensa|Add to pantry/i)).toBeVisible({ timeout: 8000 })
    await expect(dialog.getByPlaceholder(/nombre del alimento|food name/i)).toHaveValue('Pollo')
    await dialog.getByRole('button', { name: /^(Confirmar|Confirm)$/i }).click()
    await expect(dialog).toBeHidden({ timeout: 8000 })
    await expect(page.getByText(/^Pollo$/i).first()).toBeVisible({ timeout: 8000 })
  })
})

test.describe('Despensa F5: scan de recibo', () => {
  test('subir foto de recibo → items parseados → confirmar al inventario', async ({ page, request }) => {
    test.setTimeout(90_000)
    await register(page)
    await page.route('**/api/pantry/parse-receipt', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          store_name: 'Supermercado E2E',
          purchase_date: '2026-07-09',
          currency: 'USD',
          exchange_rate_usd: null,
          items: [
            { name: 'Pollo', name_normalized: 'pollo', category: 'proteina', quantity: 2, unit: 'kg', price_total: 8, expiry_days: 5, confidence: 'high', raw_line: 'POLLO ENT KG 2.0 8.00' },
            { name: 'Arroz', name_normalized: 'arroz', category: 'carbohidrato', quantity: 1, unit: 'kg', price_total: 2, expiry_days: 180, confidence: 'high', raw_line: 'ARROZ BL KG 1.0 2.00' },
          ],
          ignored_lines: ['SUBTOTAL 10.00'],
          model_used: 'mock-e2e',
        }),
      }),
    )
    await navigateTo(page, '/pantry')

    await page.locator('input[type="file"]').setInputFiles('tests/fixtures/pan.jpg')

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Agregar a la despensa|Add to pantry/i)).toBeVisible({ timeout: 10000 })
    await expect(dialog.getByText(/Supermercado E2E/i)).toBeVisible()
    await dialog.getByRole('button', { name: /^(Confirmar|Confirm)$/i }).click()
    await expect(dialog).toBeHidden({ timeout: 8000 })

    await expect(page.getByText(/^Pollo$/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/^Arroz$/i).first()).toBeVisible()

    const auth = await pbAuth(page)
    expect(
      await pbCount(request, auth, 'pantry_items', `user='${auth.userId}' && source='receipt'`),
      'los items del recibo no quedaron con source=receipt',
    ).toBe(2)
  })
})

test.describe('Despensa F2: ciclo de compra', () => {
  test('generar lista → añadir producto → marcar → compra hecha → al inventario', async ({ page, request }) => {
    test.setTimeout(90_000)
    await register(page)
    await navigateTo(page, '/pantry')
    await addItemManual(page, 'Pollo', { qty: 2, price: 8 })

    await navigateTo(page, '/pantry/shopping')
    await expect(page.getByText(/Lista de compras|Shopping list/i).first()).toBeVisible({ timeout: 8000 })

    // Primera vez: generar la lista (100% client-side, sin IA)
    await page.getByRole('button', { name: /Generar lista|Generate list/i }).click()
    // Esperar a que la lista generada esté ACTIVA en cache antes de añadir:
    // un add prematuro crearía una segunda lista activa (carrera real).
    await expect(page.getByText(/PRÓXIMA COMPRA|NEXT PURCHASE/i).first()).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(500)

    // Añadir un producto manual a la lista
    const addInput = page.getByPlaceholder(/Agregar producto|Add product/i)
    await expect(addInput).toBeVisible({ timeout: 8000 })
    await addInput.fill('Avena')
    await addInput.press('Enter')
    await expect(page.getByText(/^Avena$/i).first()).toBeVisible({ timeout: 8000 })

    // Marcarlo como comprado (click en la fila) y ponerle precio real
    await page.getByText(/^Avena$/i).first().click()
    const priceInput = page.getByPlaceholder(/\$ real|\$ actual/i).first()
    await expect(priceInput).toBeVisible({ timeout: 5000 })
    await priceInput.fill('3')

    // Cerrar el ciclo
    await page.getByRole('button', { name: /Compra hecha|Purchase done/i }).click()
    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog.getByText(/¿Compra hecha\?|Purchase done\?/i)).toBeVisible({ timeout: 5000 })
    await confirmDialog.getByRole('button', { name: /Compra hecha|Purchase done|Confirmar|Confirm/i }).click()

    // Vuelve a /pantry con la avena ya en el inventario
    await expect(page).toHaveURL(/\/pantry$/, { timeout: 10000 })
    await expect(page.getByText(/^Avena$/i).first()).toBeVisible({ timeout: 8000 })

    const auth = await pbAuth(page)
    expect(
      await pbCount(request, auth, 'shopping_lists', `user='${auth.userId}' && status='done'`),
      'el ciclo no quedó cerrado en shopping_lists',
    ).toBe(1)
    expect(
      await pbCount(request, auth, 'pantry_items', `user='${auth.userId}' && name_normalized='avena' && source='shopping'`),
      'la avena comprada no llegó al inventario',
    ).toBe(1)
  })
})

test.describe('Despensa F3 + #179: plan del día y recetas', () => {
  test('plan del día + cuántas comidas + guardar receta favorita', async ({ page, request }) => {
    test.setTimeout(90_000)
    await register(page)
    const auth = await pbAuth(page)

    // Objetivos de nutrición por REST: el dashboard (y con él la sección de
    // despensa) está gateado por !goals; el wizard de objetivos ya tiene specs.
    const goalsRes = await request.post(`${PB_URL}/api/collections/nutrition_goals/records`, {
      headers: { Authorization: auth.token },
      data: {
        user: auth.userId, daily_calories: 2200, daily_protein: 150,
        daily_carbs: 220, daily_fat: 70, goal: 'maintain', weight: 75,
        height: 175, age: 30, sex: 'male', activity_level: 'active',
      },
    })
    expect(goalsRes.ok(), 'no se pudo sembrar nutrition_goals').toBeTruthy()

    await navigateTo(page, '/pantry')
    await addItemManual(page, 'Pollo', { qty: 2, price: 8 })
    await addItemManual(page, 'Arroz', { qty: 1, price: 2 })

    // Stub del endpoint síncrono, discriminando por horizon
    await page.route('**/api/generate-pantry-plan', async (route) => {
      const body = route.request().postDataJSON()
      if (body?.horizon === 'how_many_meals') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            total_meals: 8, days_covered: 3,
            breakdown: [{ meal_label: 'Pollo con arroz', times_possible: 4, limiting_ingredient: 'pollo' }],
            summary: 'Te alcanza para unos 3 días.', model_used: 'mock-e2e',
          }),
        })
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          target_date: '2026-07-10',
          meals: [{
            meal_type: 'almuerzo', label: 'Pollo con arroz',
            description: 'Pollo a la plancha con arroz blanco.',
            calories: 600, protein: 45, carbs: 50, fat: 18,
            recipe: {
              steps: ['Cocina el arroz.', 'Asa el pollo.'],
              ingredients: [
                { name: 'Pollo', name_normalized: 'pollo', qty: 200, unit: 'g', from: 'pantry' },
                { name: 'Arroz', name_normalized: 'arroz', qty: 100, unit: 'g', from: 'pantry' },
              ],
              prep_minutes: 20, servings: 1, photo_query: 'chicken rice',
            },
          }],
          notes: 'Plan de prueba.', model_used: 'mock-e2e',
        }),
      })
    })
    // La foto de la receta viene de TheMealDB (externo): stub para no depender de la red
    await page.route('**/themealdb.com/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ meals: null }) }),
    )

    // El persister de TanStack (calistenia_rq_cache) rehidrata goals=null
    // cacheado del dashboard como "fresco" (staleTime 5m) y el setup taparía
    // el dashboard: limpiarlo fuerza refetch y recoge el seed REST.
    await page.evaluate(() => localStorage.removeItem('calistenia_rq_cache'))
    await navigateTo(page, '/nutrition')
    await expect(page.getByText(/DESDE TU DESPENSA|FROM YOUR PANTRY/i)).toBeVisible({ timeout: 20000 })

    // ¿Cuántas comidas me alcanzan? (primero: su resultado y el del plan del
    // día son mutuamente excluyentes — cada uno limpia al otro)
    await page.getByRole('button', { name: /Cuántas comidas|How many meals/i }).click()
    await expect(page.getByText(/Te alcanza para unos 3 días/i)).toBeVisible({ timeout: 15000 })

    // Plan del día
    await page.getByRole('button', { name: /Generar plan del día|Generate day plan/i }).click()
    await expect(page.getByText(/Pollo con arroz/i).first()).toBeVisible({ timeout: 10000 })

    // Ver receta → guardarla como favorita
    await page.getByRole('button', { name: /Ver receta|View recipe/i }).first().click()
    const recipeDialog = page.getByRole('dialog')
    await expect(recipeDialog.getByText(/Cocina el arroz/i)).toBeVisible({ timeout: 8000 })
    await recipeDialog.getByRole('button', { name: /Guardar receta|Save recipe/i }).click()
    // El aria-label cambia a "quitar de guardadas" cuando el toggle persiste
    await expect(
      recipeDialog.getByRole('button', { name: /Quitar de guardadas|Remove from saved/i }),
    ).toBeVisible({ timeout: 8000 })
    await page.keyboard.press('Escape')

    // La receta aparece en /pantry/recipes y en PB. Mismo truco del persister:
    // el isSaved del diálogo cacheó la lista vacía pre-toggle y la rehidratación
    // la mostraría como fresca tras el full reload del goto.
    await page.evaluate(() => localStorage.removeItem('calistenia_rq_cache'))
    await navigateTo(page, '/pantry/recipes')
    await expect(page.getByText(/Mis recetas|My recipes/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/Pollo con arroz/i).first()).toBeVisible({ timeout: 8000 })
    expect(
      await pbCount(request, auth, 'saved_recipes', `user='${auth.userId}'`),
      'la receta no quedó en saved_recipes',
    ).toBe(1)
  })
})
