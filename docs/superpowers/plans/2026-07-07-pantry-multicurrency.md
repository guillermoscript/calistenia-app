# Despensa: multimoneda con USD de referencia

**Contexto**: F5 (#174) guarda `price_total` en la moneda que venga del recibo (Bs, EUR…)
con un campo `currency` informativo. Eso rompe el gasto: sumar Bs con USD da números sin
sentido, y con hiperinflación una tasa de "hoy" aplicada a una compra vieja miente.

**Principio**: **USD es la moneda funcional** (referencia contable). La factura conserva
su moneda original y la tasa usada, capturadas AL MOMENTO de la compra. La conversión
ocurre UNA vez al guardar — nunca al leer.

## Decisiones cerradas

1. **`pantry_items.price_total` es SIEMPRE USD.** Todo el pipeline existente (unitCost,
   spend.ts, dashboard Gasto, estimateItemPrice, shopping list) queda intacto — ya opera
   en una sola moneda. El campo `currency` legacy queda congelado en 'USD' (deprecado).
2. **La factura no se pierde**: campos nuevos `price_original` (monto tal cual el papel),
   `currency_original` (código canónico) y `exchange_rate` (unidades de la moneda original
   por 1 USD, la tasa usada ese día).
3. **Sin API externa de tasas.** En Venezuela la tasa oficial ≠ paralela y cambia a diario;
   una API elegiría mal siempre. Fuentes, en orden de prefill:
   a. Tasa impresa en el recibo (muy común en VE: "TASA BCV 143.50") — el parser la extrae.
   b. Última tasa usada por el usuario para esa moneda (persistida en `users.currency_rates`).
   c. Input manual en el confirm sheet.
4. **`users.default_currency`** ('USD' default): la moneda en la que el usuario habla en el
   chat ("compré pollo por 8" → 8 en SU moneda). Seleccionable en Perfil (USD/VES/EUR…).
5. **Canonicalización de moneda** en el sanitizer del server + display map en core:
   `$`→USD · `Bs|BsS|BsD|VES|bolívares`→VES · `€`→EUR. Display: VES→"Bs", USD→"$", EUR→"€".
6. **Regla de dinero se mantiene**: convertir en precisión completa; redondear solo en
   `formatMoney()`.
7. **Tasa obligatoria solo cuando hace falta**: si hay ≥1 precio no-null y la moneda ≠ USD,
   el confirm no se habilita sin tasa (prefilled = fricción mínima). Con moneda USD la fila
   de tasa ni aparece.
8. **Sin backfill**: todo lo guardado hasta hoy fue USD de facto. `price_original` null
   significa "nació en USD".

## Modelo de datos (migración PB — aditiva, segura)

`pb_migrations/17809xxxxx_add_multicurrency.js` (patrón de `1780700002_add_shopping_cadence_to_users.js`):

- `pantry_items` + `price_original` (number, nullable) — monto en la moneda del recibo
- `pantry_items` + `currency_original` (text, nullable) — código canónico (VES/EUR/USD)
- `pantry_items` + `exchange_rate` (number, nullable) — unidades por 1 USD al comprar
- `users` + `default_currency` (text, blank = USD)
- `users` + `currency_rates` (json, blank = {}) — última tasa por moneda: `{"VES":143.5}`

Campos NUEVOS (no hay cambio de tipo → no aplica el gotcha de field.id). Deploy: push a
main auto-aplica pb_migrations en prod.

## Tareas

### T1 — Core: `packages/core/lib/money.ts` (puro, con tests)
- `canonCurrency(raw: string | null): string | null` — mapea símbolos/alias a código.
- `currencySymbol(code: string): string` — VES→"Bs", USD→"$", EUR→"€", fallback código.
- `toUSD(amount: number, rate: number): number` — `amount / rate`, precisión completa.
- Tests vitest: canon (Bs/BsS/bs./VES/$/€/desconocido), toUSD, símbolos.

### T2 — Server (mcp-server)
- `ReceiptParseSchema` + `exchange_rate_usd: z.number().nullable()` — "tasa de cambio a
  USD impresa en el recibo (ej. TASA BCV); null si no aparece. NUNCA la inventes".
- Prompt fallback: línea nueva explicándola (y Langfuse cuando se suba).
- `receipt-sanitizer.ts`: canonicalizar `currency` del resultado (copia local de
  canonCurrency — mcp-server no puede importar core).

### T3 — Core: persistencia y prefs
- `types/pantry.ts`: `PantryItem` + `priceOriginal`, `currencyOriginal`, `exchangeRate`;
  `ReceiptParseResult` + `exchange_rate_usd`.
- `mapPantryRecord`: mapear los 3 campos nuevos.
- `AddPantryItemsInput`: `currency?` pasa a ser la moneda ORIGINAL; + `exchangeRate?: number | null`.
  En `useAddPantryItems`: si `currency` canónica ≠ USD y hay `exchangeRate` →
  `price_total = toUSD(price, rate)`, `price_original = price`, `currency_original`,
  `exchange_rate = rate`; si es USD → `price_total = price` directo. `currency` legacy: 'USD'.
- Hook `useUserCurrency(userId)`: lee/escribe `default_currency` y `currency_rates`
  (patrón `useShoppingList.ts:64` cadencia). Al confirmar un recibo con tasa → persistir
  `currency_rates[moneda] = tasa`.

### T4 — Mobile: confirm sheet
- Los inputs de precio siguen en la moneda ORIGINAL del recibo (coteja contra el papel).
- Si moneda canónica ≠ USD: fila de conversión bajo el header:
  `1 USD = [input] Bs` (prefill: tasa del recibo > `currency_rates` > vacío) + preview
  en vivo del total en `$` (mono, lime). Sin tasa y con precios → CONFIRMAR deshabilitado.
- `handleConfirmAdd` pasa `currency` + `exchangeRate` y actualiza `currency_rates`.

### T5 — Mobile: display y prefs
- `PantryTable` / `PantryEditSheet`: precio principal SIEMPRE `$` (USD); si
  `currencyOriginal ≠ USD`, línea secundaria pequeña "Bs 2.251,29 @ 143.50".
- Perfil: row "Moneda" → `OptionSheet` (ya existe) con USD / Bs (VES) / EUR →
  `users.default_currency`.
- Chat flow: si `default_currency ≠ USD`, los precios del chat se interpretan en esa
  moneda y el confirm sheet muestra la misma fila de tasa que el recibo.

### T6 — Verificación
- vitest core (money.ts + spend intactos), tsc apps/mobile + mcp-server, expo lint.
- Migración: `./pocketbase migrate up` local + REINICIAR PB (gotcha F3: serve no ve
  colecciones de migrate externo).
- Re-smoke `/api/pantry/parse-receipt` (schema cambió — validar strict mode con
  `.nullable()`).
- Device test Guillermo: recibo Bs con tasa impresa → prefill → total $ correcto en
  dashboard; recibo USD → sin fila de tasa; cambio de default en Perfil.

## Fuera de alcance (anotado)
- Mostrar el gasto del dashboard en otra moneda que no sea USD (referencia única, pedido explícito).
- Tasas históricas/auto-actualizadas vía API.
- Backfill de items existentes.
