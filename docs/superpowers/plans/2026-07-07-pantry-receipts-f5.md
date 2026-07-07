# Despensa F5 — Scan de recibos + $/comida y $/semana (issue #174)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foto del recibo → AI extrae items+precios → confirm sheet de F1 → despensa con precios reales; y en el dashboard de nutrición: $ por comida (via eventos consume `linked_entry` de F4) y $ semanal.

**Architecture:** 4 workstreams paralelos en worktrees manuales sobre la rama `feat/pantry-receipts`: **A** = endpoint `POST /api/pantry/parse-receipt` (multipart+visión, patrón analyze-meal) en mcp-server; **B** = `packages/core/lib/spend.ts` puro (`computeEntryCost`/`computeSpendSummary`) + hook `useSpendSummary`; **C** = flujo mobile de scan (expo-image-picker → parse → `PantryConfirmSheet` extendido) + `useAddPantryItems` parametrizado; **D** = bloque "Gasto" + badge $ en `NutritionDashboard` (depende de B). **PB no necesita migración**: `source: "receipt"`, `price_source`, `purchase_date` y `linked_entry` existen desde F1/F4.

**Tech Stack:** Hono (mcp-server), AI SDK `generateObject` + zod (⚠️ `.nullable()` NUNCA `.optional()`), PocketBase JS SDK, TanStack Query, Expo RN + NativeWind, vitest (core).

---

## Correcciones al issue (verificadas en código)

- `unitCost()` vive en `packages/core/lib/shopping.ts:74`, **no** en `pantry.ts`.
- Las rutas API viven en `mcp-server/src/mcpuse/api-routes.ts`, **no** en `src/api/api-routes.ts`.
- i18n es **flat keys** (`"pantry.confirm": "..."` literal con punto en el key), no objetos anidados.
- Tests de core corren con **vitest** (`packages/core`: `npm test`), no node puro.
- Único call site de `useAddPantryItems`: `apps/mobile/src/app/pantry.tsx:33`.

## Orquestación (para el agente principal)

```bash
cd /Users/guillermomarin/Documents/ejercicios/calistenia-app
git checkout -b feat/pantry-receipts main
git add docs/superpowers/plans/2026-07-07-pantry-receipts-f5.md
git commit -m "docs: plan F5 scan de recibos (#174)"
# worktrees manuales (NO isolation:"worktree" del tool Agent — falló silencioso antes)
git worktree add /tmp/wt-f5-server  -b wt/f5-server  feat/pantry-receipts
git worktree add /tmp/wt-f5-core    -b wt/f5-core    feat/pantry-receipts
git worktree add /tmp/wt-f5-mobile  -b wt/f5-mobile  feat/pantry-receipts
git worktree add /tmp/wt-f5-dash    -b wt/f5-dash    feat/pantry-receipts
```

- Agentes A/B/C arrancan en paralelo (worktrees server/core/mobile). **D arranca cuando B esté mergeado** a `feat/pantry-receipts` (importa `useSpendSummary`); su worktree se crea/rebasea en ese momento.
- Reglas de subagentes: `model: sonnet`; todo comando git con `git -C <worktree>`; `git add` SOLO con paths explícitos; PROHIBIDO `stash pop` / `merge` / `pull` / `rebase` / tocar archivos fuera de su scope.
- Merge (lo hace el agente principal, no los subagentes): `git -C <repo> merge --no-ff wt/f5-core` etc., orden B → A → C → D. Conflicto esperable y trivial: B y C tocan `packages/core/hooks/usePantry.ts` en funciones distintas (`useConsumePantryMatches` vs `useAddPantryItems`); C y D añaden i18n en secciones distintas (`pantry.*` vs `nutrition.*`).
- ⚠️ En worktrees, `tsc` puede dar falsos errores por symlinks de workspace (gotcha conocido): si un error de tipos no tiene sentido, verificar en el repo principal tras merge.

## Contratos compartidos (fijados aquí; ningún agente los cambia)

**Wire de `/api/pantry/parse-receipt`** (snake_case; zod en A, TS en C — deben coincidir):

```ts
// respuesta:
{
  store_name: string | null,
  purchase_date: string | null,   // YYYY-MM-DD
  currency: string | null,
  items: Array<PantryParsedItem & { raw_line: string }>,  // PantryParsedItem ya trae price_total
  ignored_lines: string[],
  model_used: string,
  usage: { prompt_tokens?: number, completion_tokens?: number, total_tokens?: number },
}
```

**Spend (B exporta desde `packages/core/lib/spend.ts`):**

```ts
export type SpendCoverage = 'full' | 'partial' | 'none'
export interface EntryCost { total: number; currency: string; coverage: SpendCoverage }
export interface SpendEntryLite { id: string; date: string; foodsCount: number }  // date = YYYY-MM-DD LOCAL
export interface SpendSummary {
  weekTotal: number
  byDay: { date: string; total: number }[]   // 7 días desde weekStart
  avgPerMeal: number
  mealsWithCost: number
  currency: string
  hasPartial: boolean
}
export function computeEntryCost(entryId: string, foodsCount: number, events: PantryEvent[], itemsById: Map<string, PantryItem>): EntryCost
export function computeSpendSummary(entries: SpendEntryLite[], events: PantryEvent[], itemsById: Map<string, PantryItem>, weekStart: string): SpendSummary
```

**Hook (B exporta desde `packages/core/hooks/useSpend.ts`):**

```ts
export interface SpendData { summary: SpendSummary; costByEntry: Record<string, EntryCost> }
export function useSpendSummary(userId: string | null, weekStart: string): UseQueryResult<SpendData>
```

Regla de dinero del repo (`shopping.ts`): acumular en precisión completa, redondear SOLO al presentar con `formatMoney`.

---

# Workstream A — mcp-server: endpoint parse-receipt

Worktree: `/tmp/wt-f5-server`. Scope: SOLO `mcp-server/src/api/schemas.ts`, `mcp-server/src/api/pantry-parser.ts`, `mcp-server/src/api/prompts.ts`, `mcp-server/src/mcpuse/api-routes.ts`.

### Task A1: `ReceiptParseSchema`

**Files:**
- Modify: `mcp-server/src/api/schemas.ts` (después de `MatchConsumptionSchema`, ~línea 141)

- [ ] **Step 1: Añadir el schema**

```ts
// ─── Despensa F5: parser de recibos (#174) ───────────────────────────────────
// ⚠️ OpenAI strict mode: SIEMPRE .nullable(), NUNCA .optional()

export const ReceiptItemSchema = PantryParsedItemSchema.extend({
  raw_line: z
    .string()
    .describe('Línea original del recibo tal cual aparece, ej: "POLLO ENT KG 2.145 8.58"'),
});

export const ReceiptParseSchema = z.object({
  store_name: z.string().nullable().describe("Nombre de la tienda si se lee en el recibo; null si no"),
  purchase_date: z
    .string()
    .nullable()
    .describe("Fecha de compra en formato YYYY-MM-DD si se lee del recibo; null si no"),
  currency: z
    .string()
    .nullable()
    .describe("Moneda del recibo como código o símbolo (USD, Bs, EUR); null si no se distingue"),
  items: z.array(ReceiptItemSchema).describe("SOLO líneas de comida/bebida, con su precio de línea"),
  ignored_lines: z
    .array(z.string())
    .describe("Líneas ignoradas: subtotales, IVA, descuentos, no-comida (detergente, etc.)"),
});
```

- [ ] **Step 2: Typecheck**

Run: `cd /tmp/wt-f5-server/mcp-server && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-f5-server add mcp-server/src/api/schemas.ts
git -C /tmp/wt-f5-server commit -m "feat(despensa): ReceiptParseSchema para parser de recibos (#174)"
```

### Task A2: `parseReceipt()` con visión

**Files:**
- Modify: `mcp-server/src/api/pantry-parser.ts`

- [ ] **Step 1: Añadir al final del archivo** (import de `ReceiptParseSchema` en la línea 4 junto a los otros, y `type Tier` desde model-resolver):

```ts
// línea 2 queda: import { resolveModel, type Tier } from "./model-resolver.js";
// línea 4 queda: import { PantryParseSchema, MatchConsumptionSchema, ReceiptParseSchema } from "./schemas.js";

interface ReceiptParseInput {
  images: { buffer: Buffer; mimeType: string }[];
  tier: Tier;
}

// #174 F5: visión sobre recibo (borroso, abreviado) = tarea dura → tier del
// usuario, como analyze-meal. NO fijar "free" (eso es solo para parsing de texto).
export async function parseReceipt({ images, tier }: ReceiptParseInput) {
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("receipt-parser");

  const imageContent = images.map((img) => ({
    type: "image" as const,
    image: new Uint8Array(img.buffer),
    mediaType: img.mimeType as any,
  }));
  const userText =
    images.length > 1
      ? `Estas ${images.length} fotos son partes del MISMO recibo de supermercado (recibo largo). Extrae todos los items de comida con sus precios, sin duplicar los del solape entre fotos.`
      : "Extrae los items de comida y sus precios de esta foto de recibo de supermercado.";

  const { object, usage } = await generateObject({
    model,
    schema: ReceiptParseSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "receipt-parser",
      metadata: { tier, modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: [...imageContent, { type: "text" as const, text: userText }] },
    ],
  });

  return {
    ...object,
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}
```

Nota: si `model-resolver.ts` no exporta `Tier` con ese nombre exacto, usar el tipo que exporte (`"free" | "pro"`) — verificar en el archivo, no asumir.

- [ ] **Step 2: Typecheck** — `cd /tmp/wt-f5-server/mcp-server && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-f5-server add mcp-server/src/api/pantry-parser.ts
git -C /tmp/wt-f5-server commit -m "feat(despensa): parseReceipt con vision, tier del usuario (#174)"
```

### Task A3: FALLBACK `receipt-parser`

**Files:**
- Modify: `mcp-server/src/api/prompts.ts` (dentro del objeto `FALLBACKS`, después de `"pantry-consumption-matcher"`)

- [ ] **Step 1: Añadir la entrada** (mismo estilo que `"pantry-parser"`):

```ts
  "receipt-parser": `Eres un asistente que extrae items de comida de FOTOS de recibos de supermercado en español.

## Qué extraer
- SOLO líneas de comida y bebida. Todo lo demás (detergente, bolsas, artículos de limpieza/higiene, subtotales, IVA, descuentos, totales, método de pago, encabezados) va en ignored_lines TAL CUAL aparece.
- store_name: nombre de la tienda si se lee (encabezado del recibo); si no, null.
- purchase_date: fecha del recibo en formato YYYY-MM-DD si aparece; si no, null. NUNCA inventes la fecha.
- currency: código o símbolo de la moneda del recibo ("USD", "Bs", "EUR"); null si no se distingue.

## Por cada item
- raw_line: la línea ORIGINAL del recibo tal cual ("POLLO ENT KG 2.145 8.58").
- name: nombre legible expandiendo abreviaciones de recibo: "POLLO ENT" → "pollo entero", "LCH DESC" → "leche descremada", "QSO BLANCO" → "queso blanco".
- name_normalized: lowercase, sin acentos, singular.
- quantity + unit: infiérelos del formato peso×precio si existe ("KG 2.145" → 2.145/kg; "3 X 1.50" → 3/unidad). Sin pista → null/null.
- price_total: el precio DE LA LÍNEA (lo pagado por ese item, con descuento de línea aplicado si lo hay). Es el dato más importante: si un precio no se lee con claridad, null — NUNCA lo inventes.
- expiry_days: días estimados hasta vencer según categoría (comprado en la fecha del recibo, refrigerado): proteína fresca 3, vegetal 7, fruta 7, carbohidrato seco (arroz/pasta/avena) 365, pan 5, lácteo 10, grasa/aceite 180, condimento 365, bebida 30, congelado 90. Si no aplica → null.
- confidence: high = nombre y precio claros; med = abreviación interpretada o cantidad inferida; low = línea borrosa o dudosa.

## Reglas
- NUNCA inventes items que no están en el recibo.
- Si el recibo viene en varias fotos con solape, no dupliques items.
- Si la imagen NO es un recibo o es ilegible: items = [] e ignored_lines = [] (el cliente muestra el error).`,
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /tmp/wt-f5-server/mcp-server && npx tsc --noEmit
git -C /tmp/wt-f5-server add mcp-server/src/api/prompts.ts
git -C /tmp/wt-f5-server commit -m "feat(despensa): fallback prompt receipt-parser (#174)"
```

### Task A4: ruta `POST /api/pantry/parse-receipt`

**Files:**
- Modify: `mcp-server/src/mcpuse/api-routes.ts` (después del bloque `/api/pantry/match-consumption`, ~línea 626)

- [ ] **Step 1: Añadir import** de `parseReceipt` donde se importan `parsePantryText`/`matchConsumption`.

- [ ] **Step 2: Añadir la ruta** (patrón multipart EXACTO de analyze-meal, líneas 125-179):

```ts
  // #174 F5: parser de recibos — multipart con hasta 3 fotos (recibos largos)
  app.post("/api/pantry/parse-receipt", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      let formData: FormData;
      try { formData = await c.req.formData(); } catch { return c.json({ error: "Se requiere multipart/form-data" }, 400); }
      const fileEntries = formData.getAll("images") as File[];
      if (fileEntries.length === 0) {
        return c.json({ error: "Se requiere al menos una imagen del recibo" }, 400);
      }
      for (const f of fileEntries.slice(0, 3)) {
        if (!config.upload.allowedMimeTypes.includes(f.type))
          return c.json({ error: `Tipo de archivo no soportado: ${f.type}` }, 400);
        if (f.size > config.upload.maxSizeMb * 1024 * 1024)
          return c.json({ error: "La imagen excede el tamaño máximo permitido" }, 413);
      }
      const images = await Promise.all(fileEntries.slice(0, 3).map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        mimeType: f.type,
      })));
      const result = await parseReceipt({ images, tier: getTier(user) });
      return c.json(result);
    } catch (err) { return apiError(c, err); }
  });
```

- [ ] **Step 3: Actualizar el contador** de la línea final: `"/api/health + 15 /api/* endpoints"` → `16`.

- [ ] **Step 4: Typecheck + commit**

```bash
cd /tmp/wt-f5-server/mcp-server && npx tsc --noEmit
git -C /tmp/wt-f5-server add mcp-server/src/mcpuse/api-routes.ts
git -C /tmp/wt-f5-server commit -m "feat(despensa): POST /api/pantry/parse-receipt multipart (#174)"
```

### Task A5: smoke REAL contra OpenAI (obligatorio — tsc no detecta el gotcha .nullable)

- [ ] **Step 1: Levantar el server** — `cd /tmp/wt-f5-server/mcp-server && npm run dev:simple` (puerto 3001; necesita el `.env` del repo principal — copiarlo si el worktree no lo tiene: `cp <repo>/mcp-server/.env /tmp/wt-f5-server/mcp-server/.env`).

- [ ] **Step 2: Token de test + request con una imagen cualquiera** (PB local debe estar corriendo; credenciales en memoria `project_local_test_user.md`):

```bash
TOKEN=$(curl -s http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"test-b@local.test","password":"TestUser123!"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
curl -s -X POST http://localhost:3001/api/pantry/parse-receipt \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@/Users/guillermomarin/Documents/ejercicios/calistenia-app/apps/mobile/assets/icon.png"
```

Expected: **HTTP 200 con JSON válido** (`items` probablemente `[]` — la imagen no es un recibo; eso está bien). Lo que se verifica es que OpenAI strict mode ACEPTA el schema. Un 502/400 con mensaje de "required"/"schema" = el gotcha `.optional()` — revisar el schema.

- [ ] **Step 3: Stop conditions** — si el smoke falla 2 veces tras un intento razonable de fix, o si el `.env` no tiene API keys: parar y reportar al agente principal con el output exacto.

---

# Workstream B — core: costos deterministas + hook

Worktree: `/tmp/wt-f5-core`. Scope: SOLO `packages/core/lib/spend.ts` (nuevo), `packages/core/lib/spend.test.ts` (nuevo), `packages/core/hooks/useSpend.ts` (nuevo), `packages/core/lib/query-keys.ts`, `packages/core/hooks/usePantry.ts` (SOLO el `onSettled` de `useConsumePantryMatches` y `useAdjustPantryItem`).

### Task B1: tests de `computeEntryCost` (TDD)

**Files:**
- Create: `packages/core/lib/spend.test.ts`

- [ ] **Step 1: Escribir los tests**

```ts
import { describe, it, expect } from 'vitest'
import { computeEntryCost, computeSpendSummary } from './spend'
import type { PantryEvent, PantryItem } from '../types'

const item = (over: Partial<PantryItem>): PantryItem => ({
  id: 'x', name: 'a', nameNormalized: 'a', category: 'otro', quantity: 1,
  unit: 'unidad', priceTotal: null, currency: 'USD', priceSource: null,
  purchaseDate: null, expiryEstimate: null, confidence: 'high',
  status: 'active', source: 'chat', ...over,
})
const ev = (over: Partial<PantryEvent>): PantryEvent => ({
  id: 'e', item: 'x', type: 'consume', deltaQty: -1, linkedEntry: 'entry1', ...over,
})

describe('computeEntryCost', () => {
  it('criterio de aceptación #174: pollo $8/2kg, 500g consumidos → $2.00', () => {
    const pollo = item({ id: 'p1', quantity: 2, unit: 'kg', priceTotal: 8 })
    const events = [ev({ item: 'p1', deltaQty: -0.5 })] // delta en la UNIDAD del item (kg)
    const cost = computeEntryCost('entry1', 1, events, new Map([['p1', pollo]]))
    expect(cost.total).toBeCloseTo(2, 5)
    expect(cost.coverage).toBe('full')
    expect(cost.currency).toBe('USD')
  })

  it('sin eventos linked → none con total 0', () => {
    expect(computeEntryCost('entry1', 2, [], new Map())).toEqual({ total: 0, currency: 'USD', coverage: 'none' })
  })

  it('eventos de OTRO entry no cuentan', () => {
    const p = item({ id: 'p1', quantity: 1, unit: 'kg', priceTotal: 4 })
    const events = [ev({ item: 'p1', deltaQty: -0.5, linkedEntry: 'otro' })]
    expect(computeEntryCost('entry1', 1, events, new Map([['p1', p]])).coverage).toBe('none')
  })

  it('item sin precio → partial (hay evento pero costo incompleto)', () => {
    const conPrecio = item({ id: 'p1', quantity: 1, unit: 'kg', priceTotal: 4 })
    const sinPrecio = item({ id: 'p2', quantity: 6, unit: 'unidad', priceTotal: null })
    const events = [ev({ id: 'e1', item: 'p1', deltaQty: -0.25 }), ev({ id: 'e2', item: 'p2', deltaQty: -2 })]
    const cost = computeEntryCost('entry1', 2, events, new Map([['p1', conPrecio], ['p2', sinPrecio]]))
    expect(cost.total).toBeCloseTo(1, 5)
    expect(cost.coverage).toBe('partial')
  })

  it('menos eventos que foods → partial (food sin match)', () => {
    const p = item({ id: 'p1', quantity: 2, unit: 'kg', priceTotal: 8 })
    const events = [ev({ item: 'p1', deltaQty: -0.5 })]
    expect(computeEntryCost('entry1', 3, events, new Map([['p1', p]])).coverage).toBe('partial')
  })

  it('todos los eventos sin precio → none (no mostrar $0 falso)', () => {
    const p = item({ id: 'p1', quantity: 2, unit: 'kg', priceTotal: null })
    const events = [ev({ item: 'p1', deltaQty: -0.5 })]
    expect(computeEntryCost('entry1', 1, events, new Map([['p1', p]])).coverage).toBe('none')
  })
})

describe('computeSpendSummary', () => {
  const pollo = item({ id: 'p1', quantity: 2, unit: 'kg', priceTotal: 8 })
  const itemsById = new Map([['p1', pollo]])

  it('bucketiza por día, total semanal y promedio por comida', () => {
    const entries = [
      { id: 'a', date: '2026-07-06', foodsCount: 1 },  // lunes
      { id: 'b', date: '2026-07-07', foodsCount: 1 },
      { id: 'c', date: '2026-07-07', foodsCount: 1 },  // sin eventos → no cuenta
    ]
    const events = [
      ev({ id: 'e1', item: 'p1', deltaQty: -0.5, linkedEntry: 'a' }),   // $2
      ev({ id: 'e2', item: 'p1', deltaQty: -0.25, linkedEntry: 'b' }),  // $1
    ]
    const s = computeSpendSummary(entries, events, itemsById, '2026-07-06')
    expect(s.weekTotal).toBeCloseTo(3, 5)
    expect(s.byDay).toHaveLength(7)
    expect(s.byDay[0]).toEqual({ date: '2026-07-06', total: 2 })
    expect(s.byDay[1].total).toBeCloseTo(1, 5)
    expect(s.mealsWithCost).toBe(2)
    expect(s.avgPerMeal).toBeCloseTo(1.5, 5)
    expect(s.hasPartial).toBe(false)
  })

  it('entry fuera de la semana no cuenta; partial propaga hasPartial', () => {
    const entries = [
      { id: 'a', date: '2026-07-05', foodsCount: 1 },  // fuera (domingo anterior)
      { id: 'b', date: '2026-07-08', foodsCount: 2 },  // 2 foods, 1 evento → partial
    ]
    const events = [
      ev({ id: 'e1', item: 'p1', deltaQty: -0.5, linkedEntry: 'a' }),
      ev({ id: 'e2', item: 'p1', deltaQty: -0.5, linkedEntry: 'b' }),
    ]
    const s = computeSpendSummary(entries, events, itemsById, '2026-07-06')
    expect(s.weekTotal).toBeCloseTo(2, 5)
    expect(s.mealsWithCost).toBe(1)
    expect(s.hasPartial).toBe(true)
  })

  it('semana vacía → todo en cero', () => {
    const s = computeSpendSummary([], [], new Map(), '2026-07-06')
    expect(s).toMatchObject({ weekTotal: 0, avgPerMeal: 0, mealsWithCost: 0, hasPartial: false })
  })
})
```

- [ ] **Step 2: Verificar que fallan** — `cd /tmp/wt-f5-core/packages/core && npx vitest run lib/spend.test.ts`
Expected: FAIL — `Cannot find module './spend'` (o equivalente).

### Task B2: implementar `spend.ts`

**Files:**
- Create: `packages/core/lib/spend.ts`

- [ ] **Step 1: Implementación completa**

```ts
/**
 * Despensa F5 (issue #174): atribución de costo real por comida y resumen
 * semanal de gasto. CÓDIGO PURO — cero LLM, cero I/O. Fuente: eventos consume
 * con linked_entry (F4) × unitCost (F3). Regla de dinero: acumular en precisión
 * completa; redondear SOLO al presentar (formatMoney).
 */
import type { PantryEvent, PantryItem } from '../types'
import { addDaysISO, normalizeQty, unitCost } from './shopping'

export type SpendCoverage = 'full' | 'partial' | 'none'

export interface EntryCost {
  total: number
  currency: string
  /** partial = algún food sin evento o sin precio → la UI antepone "≥". */
  coverage: SpendCoverage
}

/** Subset de nutrition_entry que necesita el cálculo. date = YYYY-MM-DD LOCAL. */
export interface SpendEntryLite {
  id: string
  date: string
  foodsCount: number
}

export interface SpendSummary {
  weekTotal: number
  byDay: { date: string; total: number }[]
  avgPerMeal: number
  mealsWithCost: number
  currency: string
  hasPartial: boolean
}

/**
 * Costo real de un nutrition_entry: Σ |delta_qty| × unitCost(item) de sus
 * eventos consume (linked_entry). delta_qty viene en la UNIDAD del item
 * (contrato F4) → se normaliza a base antes de multiplicar por costPerBase.
 * Cobertura (proxy determinista, F4 crea un evento por food matcheado):
 * - none: sin eventos, o ningún evento con precio (no mostrar $0 falso)
 * - partial: menos eventos que foods, o algún evento sin precio
 * - full: todos los eventos con precio y eventos ≥ foods
 */
export function computeEntryCost(
  entryId: string,
  foodsCount: number,
  events: PantryEvent[],
  itemsById: Map<string, PantryItem>,
): EntryCost {
  const evs = events.filter(
    (e) => e.type === 'consume' && e.linkedEntry === entryId && e.deltaQty != null && e.deltaQty < 0,
  )
  if (evs.length === 0) return { total: 0, currency: 'USD', coverage: 'none' }

  let total = 0
  let currency = 'USD'
  let priced = 0
  for (const e of evs) {
    const item = itemsById.get(e.item)
    const uc = item ? unitCost(item) : null
    if (!item || !uc || item.unit == null) continue
    total += normalizeQty(Math.abs(e.deltaQty as number), item.unit).qty * uc.costPerBase
    currency = uc.currency
    priced++
  }
  if (priced === 0) return { total: 0, currency, coverage: 'none' }
  const coverage: SpendCoverage = priced === evs.length && evs.length >= foodsCount ? 'full' : 'partial'
  return { total, currency, coverage }
}

/** Resumen de la semana [weekStart, weekStart+6]. Entries fuera se ignoran. */
export function computeSpendSummary(
  entries: SpendEntryLite[],
  events: PantryEvent[],
  itemsById: Map<string, PantryItem>,
  weekStart: string,
): SpendSummary {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))
  const byDay = days.map((date) => ({ date, total: 0 }))
  let weekTotal = 0
  let mealsWithCost = 0
  let hasPartial = false
  let currency = 'USD'

  for (const entry of entries) {
    const di = days.indexOf(entry.date)
    if (di === -1) continue
    const cost = computeEntryCost(entry.id, entry.foodsCount, events, itemsById)
    if (cost.coverage === 'none') continue
    weekTotal += cost.total
    byDay[di].total += cost.total
    mealsWithCost++
    currency = cost.currency
    if (cost.coverage === 'partial') hasPartial = true
  }

  return {
    weekTotal,
    byDay,
    avgPerMeal: mealsWithCost > 0 ? weekTotal / mealsWithCost : 0,
    mealsWithCost,
    currency,
    hasPartial,
  }
}
```

- [ ] **Step 2: Correr tests** — `cd /tmp/wt-f5-core/packages/core && npx vitest run lib/spend.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-f5-core add packages/core/lib/spend.ts packages/core/lib/spend.test.ts
git -C /tmp/wt-f5-core commit -m "feat(despensa): computeEntryCost + computeSpendSummary con tests (#174)"
```

### Task B3: query key + hook `useSpendSummary`

**Files:**
- Modify: `packages/core/lib/query-keys.ts` (bloque `pantry`, ~línea 180)
- Create: `packages/core/hooks/useSpend.ts`

- [ ] **Step 1: Añadir key** dentro de `pantry: { ... }`:

```ts
    spend: (userId: string | null, weekStart: string) =>
      ['pantry', 'spend', userId, weekStart] as const,
```

- [ ] **Step 2: Crear el hook**

```ts
/**
 * useSpendSummary — F5 (#174). Junta entries de la semana + eventos consume
 * (expand item, así los items depleted/discarded siguen aportando su precio)
 * y computa gasto determinista en el cliente.
 */
import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { utcToLocalDateStr } from '../lib/dateUtils'
import { addDaysISO } from '../lib/shopping'
import { mapPantryRecord } from './usePantry'
import {
  computeEntryCost, computeSpendSummary,
  type EntryCost, type SpendEntryLite, type SpendSummary,
} from '../lib/spend'
import type { PantryEvent, PantryItem } from '../types'

export interface SpendData {
  summary: SpendSummary
  /** Costo por nutrition_entry id — para el badge $ en las tarjetas de comida. */
  costByEntry: Record<string, EntryCost>
}

export function useSpendSummary(userId: string | null, weekStart: string) {
  return useQuery({
    queryKey: qk.pantry.spend(userId, weekStart),
    enabled: !!userId,
    queryFn: async (): Promise<SpendData> => {
      // Pad ±1 día: logged_at/created son UTC y la semana se bucketiza en fecha LOCAL
      const from = addDaysISO(weekStart, -1)
      const to = addDaysISO(weekStart, 8)

      const entryRecs = await pb.collection('nutrition_entries').getFullList({
        filter: pb.filter('user = {:uid} && logged_at >= {:from} && logged_at < {:to}', {
          uid: userId!, from: `${from} 00:00:00`, to: `${to} 00:00:00`,
        }),
        fields: 'id,logged_at,foods',
      })
      const entries: SpendEntryLite[] = entryRecs.map((r: Record<string, any>) => ({
        id: r.id,
        date: utcToLocalDateStr(r.logged_at),
        foodsCount: Array.isArray(r.foods) ? r.foods.length : 0,
      }))

      const evRecs = await pb.collection('pantry_events').getFullList({
        filter: pb.filter('user = {:uid} && type = "consume" && linked_entry != "" && created >= {:from}', {
          uid: userId!, from: `${from} 00:00:00`,
        }),
        expand: 'item',
      })
      const itemsById = new Map<string, PantryItem>()
      const events: PantryEvent[] = evRecs.map((r: Record<string, any>) => {
        if (r.expand?.item) itemsById.set(r.item, mapPantryRecord(r.expand.item))
        return {
          id: r.id, user: r.user, item: r.item, type: r.type,
          deltaQty: r.delta_qty != null ? Number(r.delta_qty) : null,
          linkedEntry: r.linked_entry || null,
        }
      })

      const costByEntry: Record<string, EntryCost> = {}
      for (const e of entries) costByEntry[e.id] = computeEntryCost(e.id, e.foodsCount, events, itemsById)

      const weekEnd = addDaysISO(weekStart, 7)
      const weekEntries = entries.filter((e) => e.date >= weekStart && e.date < weekEnd)
      return { summary: computeSpendSummary(weekEntries, events, itemsById, weekStart), costByEntry }
    },
  })
}
```

Nota: `mapPantryRecord` ya se exporta desde `usePantry.ts:10`. Si al colgar el `fields` PB se queja del JSON `foods`, quitar `fields` y mapear igual (solo cuesta payload).

- [ ] **Step 3: Invalidación** — en `packages/core/hooks/usePantry.ts`, dentro del `onSettled` de `useConsumePantryMatches` (línea ~226) Y de `useAdjustPantryItem` (línea ~164; editar precio recalcula costos), añadir UNA línea a cada uno:

```ts
      qc.invalidateQueries({ queryKey: ['pantry', 'spend'] })
```

NO tocar nada más de `usePantry.ts` (el workstream C edita `useAddPantryItems` en paralelo).

- [ ] **Step 4: Typecheck + tests + commit**

```bash
cd /tmp/wt-f5-core/packages/core && npx tsc --noEmit && npx vitest run
git -C /tmp/wt-f5-core add packages/core/hooks/useSpend.ts packages/core/lib/query-keys.ts packages/core/hooks/usePantry.ts
git -C /tmp/wt-f5-core commit -m "feat(despensa): hook useSpendSummary + invalidación spend (#174)"
```

---

# Workstream C — mobile: scan de recibo + confirm sheet extendido

Worktree: `/tmp/wt-f5-mobile`. Scope: `packages/core/types/pantry.ts`, `packages/core/hooks/usePantry.ts` (SOLO `useAddPantryItems`), `apps/mobile/src/lib/receipt-api.ts` (nuevo), `apps/mobile/src/app/pantry.tsx`, `apps/mobile/src/components/pantry/PantryConfirmSheet.tsx`, `packages/core/locales/{es,en}/translation.json` (SOLO keys `pantry.receipt.*`).

### Task C1: tipos wire del recibo

**Files:**
- Modify: `packages/core/types/pantry.ts` (después de `PantryParseResult`, ~línea 57)

- [ ] **Step 1: Añadir tipos**

```ts
// ── F5: parser de recibos (#174) — snake_case: viene del wire ────────────────

export interface ReceiptParsedItem extends PantryParsedItem {
  /** Línea original del recibo ("POLLO ENT KG 2.145 8.58"). */
  raw_line: string
}

export interface ReceiptParseResult {
  store_name: string | null
  purchase_date: string | null   // YYYY-MM-DD
  currency: string | null
  items: ReceiptParsedItem[]
  ignored_lines: string[]
  model_used?: string
}
```

- [ ] **Step 2: Commit**

```bash
git -C /tmp/wt-f5-mobile add packages/core/types/pantry.ts
git -C /tmp/wt-f5-mobile commit -m "feat(despensa): tipos wire ReceiptParseResult (#174)"
```

### Task C2: `useAddPantryItems` parametrizado (source + purchaseDate)

**Files:**
- Modify: `packages/core/hooks/usePantry.ts:80-119` (SOLO `useAddPantryItems`)
- Modify: `apps/mobile/src/app/pantry.tsx:72` (único call site)

- [ ] **Step 1: Cambiar la mutation a input objeto** (import `PantrySource` en la línea 6 junto a los otros tipos):

```ts
export interface AddPantryItemsInput {
  items: PantryParsedItem[]
  /** Origen del alta. Default 'chat' (flujo F1). */
  source?: PantrySource
  /** YYYY-MM-DD del recibo (F5). Default hoy. También es la base del expiry. */
  purchaseDate?: string | null
}

/** Batch: crea items + su evento add. REGLA DE ORO: nunca qty sin evento. */
export function useAddPantryItems(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, source = 'chat', purchaseDate }: AddPantryItemsInput): Promise<PantryItem[]> => {
      if (!userId) throw new Error('No user')
      const baseDate = purchaseDate ?? todayStr()
      const created: PantryItem[] = []
      for (const it of items) {
        const rec = await pb.collection('pantry_items').create({
          user: userId,
          name: it.name,
          name_normalized: it.name_normalized,
          category: it.category,
          quantity: it.quantity ?? undefined,
          unit: it.unit ?? undefined,
          price_total: it.price_total ?? undefined,
          currency: 'USD',
          price_source: it.price_total != null ? 'real' : undefined,
          purchase_date: baseDate,
          expiry_estimate: expiryFromDays(it.expiry_days, baseDate) ?? undefined,
          confidence: it.confidence,
          status: 'active',
          source,
        })
        await pb.collection('pantry_events').create({
          user: userId,
          item: rec.id,
          type: 'add',
          delta_qty: it.quantity ?? 0,
        })
        created.push(mapPantryRecord(rec))
      }
      return created
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}
```

- [ ] **Step 2: Actualizar el call site** en `pantry.tsx` `handleConfirmAdd`: `addItems.mutateAsync(draft)` → `addItems.mutateAsync({ items: draft })` (C4 lo vuelve a tocar para el recibo).

- [ ] **Step 3: Typecheck + commit**

```bash
cd /tmp/wt-f5-mobile/apps/mobile && npx tsc --noEmit
git -C /tmp/wt-f5-mobile add packages/core/hooks/usePantry.ts apps/mobile/src/app/pantry.tsx
git -C /tmp/wt-f5-mobile commit -m "feat(despensa): useAddPantryItems acepta source y purchaseDate (#174)"
```

### Task C3: cliente `parseReceiptMobile`

**Files:**
- Create: `apps/mobile/src/lib/receipt-api.ts`

- [ ] **Step 1: Crear el archivo** (patrón exacto de `analyzeMealMobile` en `nutrition-api.ts`):

```ts
// F5 (#174): cliente mobile del parser de recibos — multipart URI→Blob
import { AI_API_URL } from '@calistenia/core/lib/ai-api'
import { pb } from '@calistenia/core/lib/pocketbase'
import type { ReceiptParseResult } from '@calistenia/core/types'
import { uriToBlob } from '@/lib/image-upload'
import type { ImageAsset } from '@/lib/nutrition-api'

export async function parseReceiptMobile(images: ImageAsset[]): Promise<ReceiptParseResult> {
  const formData = new FormData()
  for (const img of images.slice(0, 3)) {
    const blob = await uriToBlob(img.uri, img.mimeType || 'image/jpeg')
    formData.append('images', blob, img.fileName || 'receipt.jpg')
  }
  const headers: Record<string, string> = {}
  if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
  const res = await fetch(`${AI_API_URL}/api/pantry/parse-receipt`, {
    method: 'POST', headers, body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    // Error REAL visible (regla del repo: nada de catches silenciosos)
    throw new Error((err as { error?: string }).error || `Error ${res.status}`)
  }
  return res.json()
}
```

- [ ] **Step 2: Commit**

```bash
git -C /tmp/wt-f5-mobile add apps/mobile/src/lib/receipt-api.ts
git -C /tmp/wt-f5-mobile commit -m "feat(despensa): parseReceiptMobile (#174)"
```

### Task C4: botón scan + flujo en `pantry.tsx`

**Files:**
- Modify: `apps/mobile/src/app/pantry.tsx`

- [ ] **Step 1: Imports nuevos**

```ts
import * as ImagePicker from 'expo-image-picker'
import { ReceiptText } from 'lucide-react-native'   // añadir al import de lucide existente
import { parseReceiptMobile } from '@/lib/receipt-api'
import type { ReceiptParseResult } from '@calistenia/core/types'
```

- [ ] **Step 2: Estado + handlers** (junto a los otros handlers):

```ts
  const [receiptMeta, setReceiptMeta] = useState<
    { storeName: string | null; purchaseDate: string | null; ignoredLines: string[] } | null
  >(null)

  const runReceiptParse = async (assets: { uri: string; mimeType?: string; fileName?: string }[]) => {
    setBusy(true)
    setReply(t('pantry.receipt.analyzing'))
    try {
      const result: ReceiptParseResult = await parseReceiptMobile(assets)
      if (result.items.length === 0) {
        setReply(t('pantry.receipt.noItems'))
        return
      }
      setReceiptMeta({
        storeName: result.store_name,
        purchaseDate: result.purchase_date,
        ignoredLines: result.ignored_lines,
      })
      setReply(null)
      // ReceiptParsedItem extiende PantryParsedItem: raw_line viaja dentro del draft
      setParseResult({ intent: 'add', items: result.items, reply: '' })
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'parse_receipt' } })
      // mensaje REAL del servidor si existe (lección del bug analyze-meal en release)
      setReply(e instanceof Error && e.message ? e.message : t('pantry.receipt.error'))
    } finally {
      setBusy(false)
    }
  }

  const pickReceipt = async (mode: 'camera' | 'gallery') => {
    try {
      if (mode === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync()
        if (!perm.granted) return
        const res = await ImagePicker.launchCameraAsync({ quality: 0.7 })
        if (!res.canceled && res.assets[0]) await runReceiptParse([res.assets[0]])
      } else {
        const res = await ImagePicker.launchImageLibraryAsync({
          quality: 0.7, allowsMultipleSelection: true, selectionLimit: 3,
        })
        if (!res.canceled && res.assets.length > 0) await runReceiptParse(res.assets)
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'receipt_picker' } })
      setReply(t('pantry.receipt.error'))
    }
  }

  const handleScanReceipt = () => {
    Alert.alert(t('pantry.receipt.scanTitle'), '', [
      { text: t('pantry.receipt.camera'), onPress: () => pickReceipt('camera') },
      { text: t('pantry.receipt.gallery'), onPress: () => pickReceipt('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }
```

- [ ] **Step 3: Botón en el header** — ANTES del botón `ChefHat` (que hoy lleva `ml-auto`): mover `ml-auto` al botón nuevo:

```tsx
        <Pressable
          onPress={handleScanReceipt}
          hitSlop={4}
          className="ml-auto p-2"
          accessibilityRole="button"
          accessibilityLabel={t('pantry.receipt.scan')}
        >
          <ReceiptText size={20} color="hsl(0 0% 55%)" />
        </Pressable>
```

y quitar `ml-auto` del `className` del botón ChefHat (queda `className="p-2"`).

- [ ] **Step 4: Confirm/cierre con metadata de recibo** — reemplazar `handleConfirmAdd` y el `onClose` del sheet:

```ts
  const handleConfirmAdd = async (draft: PantryParsedItem[]) => {
    const meta = receiptMeta
    setParseResult(null)
    setReceiptMeta(null)
    try {
      await addItems.mutateAsync(
        meta
          ? { items: draft, source: 'receipt', purchaseDate: meta.purchaseDate }
          : { items: draft },
      )
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'add_items' } })
      setReply(t('pantry.saveError'))
    }
  }
```

y en el JSX del sheet: `onClose={() => { setParseResult(null); setReceiptMeta(null) }}` + prop nueva `receipt={receiptMeta}`.

- [ ] **Step 5: Typecheck + commit**

```bash
cd /tmp/wt-f5-mobile/apps/mobile && npx tsc --noEmit
git -C /tmp/wt-f5-mobile add apps/mobile/src/app/pantry.tsx
git -C /tmp/wt-f5-mobile commit -m "feat(despensa): scan de recibo con camara/galeria en pantalla despensa (#174)"
```

### Task C5: `PantryConfirmSheet` extendido (backward-compatible)

**Files:**
- Modify: `apps/mobile/src/components/pantry/PantryConfirmSheet.tsx`

- [ ] **Step 1: Prop opcional + estado** — añadir a la firma (props ausentes = UI F1 intacta):

```ts
export function PantryConfirmSheet({ visible, result, matches, onConfirmAdd, onConfirmConsume, onClose, receipt }: {
  visible: boolean
  result: PantryParseResult | null
  matches: ConsumeMatch[]
  onConfirmAdd: (items: PantryParsedItem[]) => void
  onConfirmConsume: (items: PantryItem[]) => void
  onClose: () => void
  /** F5 (#174): metadata de recibo. null/ausente = flujo chat de F1 sin cambios. */
  receipt?: { storeName: string | null; purchaseDate: string | null; ignoredLines: string[] } | null
}) {
```

y estados nuevos junto a `draft`:

```ts
  const [showRaw, setShowRaw] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
```

(resetearlos en el `useEffect` existente: `useEffect(() => { if (result?.intent === 'add') { setDraft(result.items); setShowRaw(false); setShowIgnored(false) } }, [result])`)

- [ ] **Step 2: Header de recibo** — debajo del título Bebas, dentro del `<View>` del header:

```tsx
                {receipt && (receipt.storeName || receipt.purchaseDate) && (
                  <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                    {[receipt.storeName, receipt.purchaseDate].filter(Boolean).join(' · ')}
                  </Text>
                )}
```

- [ ] **Step 3: Toggle de líneas originales** — antes del `draft.map(...)`, solo si algún item trae `raw_line`:

```tsx
              {isAdd && receipt && draft.some(d => (d as { raw_line?: string }).raw_line) && (
                <Pressable onPress={() => setShowRaw(v => !v)} hitSlop={6} className="pb-1 pt-2">
                  <Text className="font-mono text-[9px] uppercase tracking-[2px] text-lime-400/80">
                    {showRaw ? t('pantry.receipt.hideRaw') : t('pantry.receipt.showRaw')}
                  </Text>
                </Pressable>
              )}
```

y dentro de cada fila de draft (después del bloque de chips de unidad):

```tsx
                    {showRaw && (it as { raw_line?: string }).raw_line ? (
                      <Text className="mt-1 font-mono text-[9px] text-muted-foreground/70" numberOfLines={1}>
                        {(it as { raw_line?: string }).raw_line}
                      </Text>
                    ) : null}
```

- [ ] **Step 4: Sección ignored_lines colapsada** — al final del `<ScrollView>` (después del bloque add/consume), plural manual (Hermes sin `Intl.PluralRules`):

```tsx
              {receipt && receipt.ignoredLines.length > 0 && (
                <View className="py-3">
                  <Pressable onPress={() => setShowIgnored(v => !v)} hitSlop={6}>
                    <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
                      {receipt.ignoredLines.length === 1
                        ? t('pantry.receipt.ignoredOne')
                        : t('pantry.receipt.ignoredMany', { n: receipt.ignoredLines.length })}
                      {'  '}{showIgnored ? '▴' : '▾'}
                    </Text>
                  </Pressable>
                  {showIgnored && receipt.ignoredLines.map((line, i) => (
                    <Text key={`ig-${i}`} className="mt-1 font-mono text-[9px] text-muted-foreground/60" numberOfLines={1}>
                      {line}
                    </Text>
                  ))}
                </View>
              )}
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd /tmp/wt-f5-mobile/apps/mobile && npx tsc --noEmit
git -C /tmp/wt-f5-mobile add apps/mobile/src/components/pantry/PantryConfirmSheet.tsx
git -C /tmp/wt-f5-mobile commit -m "feat(despensa): PantryConfirmSheet con header recibo, raw_line e ignoradas (#174)"
```

### Task C6: i18n `pantry.receipt.*`

**Files:**
- Modify: `packages/core/locales/es/translation.json` y `packages/core/locales/en/translation.json`

- [ ] **Step 1: Añadir keys FLAT** (el JSON es plano: `"pantry.x"` literal), junto a las demás `"pantry.*"`:

es:
```json
"pantry.receipt.scan": "Escanear recibo",
"pantry.receipt.scanTitle": "Escanear recibo",
"pantry.receipt.camera": "Cámara",
"pantry.receipt.gallery": "Galería",
"pantry.receipt.analyzing": "Leyendo recibo…",
"pantry.receipt.noItems": "No encontré items de comida en el recibo.",
"pantry.receipt.error": "No se pudo leer el recibo. Intenta con una foto más clara.",
"pantry.receipt.showRaw": "Ver líneas del recibo",
"pantry.receipt.hideRaw": "Ocultar líneas del recibo",
"pantry.receipt.ignoredOne": "1 línea ignorada",
"pantry.receipt.ignoredMany": "{{n}} líneas ignoradas",
```

en:
```json
"pantry.receipt.scan": "Scan receipt",
"pantry.receipt.scanTitle": "Scan receipt",
"pantry.receipt.camera": "Camera",
"pantry.receipt.gallery": "Gallery",
"pantry.receipt.analyzing": "Reading receipt…",
"pantry.receipt.noItems": "No food items found on the receipt.",
"pantry.receipt.error": "Couldn't read the receipt. Try a clearer photo.",
"pantry.receipt.showRaw": "Show receipt lines",
"pantry.receipt.hideRaw": "Hide receipt lines",
"pantry.receipt.ignoredOne": "1 line ignored",
"pantry.receipt.ignoredMany": "{{n}} lines ignored",
```

- [ ] **Step 2: Validar JSON + lint + commit**

```bash
python3 -c "import json; json.load(open('/tmp/wt-f5-mobile/packages/core/locales/es/translation.json')); json.load(open('/tmp/wt-f5-mobile/packages/core/locales/en/translation.json')); print('OK')"
cd /tmp/wt-f5-mobile/apps/mobile && npx expo lint
git -C /tmp/wt-f5-mobile add packages/core/locales/es/translation.json packages/core/locales/en/translation.json
git -C /tmp/wt-f5-mobile commit -m "feat(despensa): i18n scan de recibos es/en (#174)"
```

---

# Workstream D — dashboard: bloque Gasto + badge $/comida

**ARRANCA cuando B esté mergeado a `feat/pantry-receipts`.** Worktree: `git worktree add /tmp/wt-f5-dash -b wt/f5-dash feat/pantry-receipts` (crear en ese momento). Scope: `apps/mobile/src/app/(tabs)/nutrition.tsx`, `apps/mobile/src/components/nutrition/NutritionDashboard.tsx`, locales (SOLO keys `nutrition.spend.*`).

### Task D1: wiring en `nutrition.tsx`

**Files:**
- Modify: `apps/mobile/src/app/(tabs)/nutrition.tsx`

- [ ] **Step 1: Hook + props.** Imports:

```ts
import { useSpendSummary } from '@calistenia/core/hooks/useSpend'
import { startOfWeekStr } from '@calistenia/core/lib/dateUtils'
```

En el cuerpo del componente (donde ya hay `userId`):

```ts
  // F5 (#174): gasto de la semana ACTUAL (V1; días fuera de esta semana no traen badge)
  const spendData = useSpendSummary(userId, startOfWeekStr()).data
```

y en el JSX de `<NutritionDashboard ...>` (línea ~740) añadir:

```tsx
            spend={spendData?.summary}
            entryCosts={spendData?.costByEntry}
```

Verificar cómo se llama la variable de user id en ese archivo (puede ser `user?.id`) y usar la existente.

### Task D2: bloque Gasto + badge en `NutritionDashboard.tsx`

**Files:**
- Modify: `apps/mobile/src/components/nutrition/NutritionDashboard.tsx`

- [ ] **Step 1: Props e imports.** Imports nuevos:

```ts
import { formatMoney } from '@calistenia/core/lib/shopping'
import type { EntryCost, SpendSummary } from '@calistenia/core/lib/spend'
```

En `NutritionDashboardProps` (línea 24):

```ts
  /** F5 (#174): resumen de gasto semanal. Ausente/sin datos → bloque oculto. */
  spend?: SpendSummary
  /** F5 (#174): costo por entry id para el badge $ de cada comida. */
  entryCosts?: Record<string, EntryCost>
```

y destructurarlas en la firma (línea 395): `spend, entryCosts,`.

- [ ] **Step 2: Badge $ en `MealCard`.** Añadir prop `cost?: EntryCost` a `MealCard` (componente interno memoizado) y renderizar junto al `ScoreBadge` (después de él, línea ~230):

```tsx
            {/* F5: costo real de la comida (≥ = cobertura parcial) */}
            {cost && cost.coverage !== 'none' && cost.total > 0 && (
              <Text className="font-mono text-[9px] text-lime-400">
                {cost.coverage === 'partial' ? '≥' : ''}${formatMoney(cost.total)}
              </Text>
            )}
```

y en el render de la lista (línea ~529) pasar `cost={entry.id ? entryCosts?.[entry.id] : undefined}`.

- [ ] **Step 3: Bloque "Gasto"** entre la summary card (cierra línea ~500) y la sección de comidas (~502). Oculto sin datos — nada de $0 falso:

```tsx
      {/* ── F5 (#174): gasto — solo con datos reales, nunca $0 falso ──────── */}
      {isToday && spend && spend.mealsWithCost > 0 && (
        <Card>
          <CardContent className="py-4">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground mb-3">
              {t('nutrition.spend.kicker', { defaultValue: 'Gasto' })}
            </Text>
            <View className="flex-row justify-between">
              <View>
                <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
                  {t('nutrition.spend.today', { defaultValue: 'Hoy' })}
                </Text>
                <Text className="font-bebas text-2xl text-foreground">
                  {spend.hasPartial ? '≥' : ''}${formatMoney(spend.byDay.find(d => d.date === todayStr())?.total ?? 0)}
                </Text>
              </View>
              <View>
                <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
                  {t('nutrition.spend.week', { defaultValue: 'Semana' })}
                </Text>
                <Text className="font-bebas text-2xl text-foreground">
                  {spend.hasPartial ? '≥' : ''}${formatMoney(spend.weekTotal)}
                </Text>
              </View>
              <View>
                <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
                  {t('nutrition.spend.perMeal', { defaultValue: 'Prom/comida' })}
                </Text>
                <Text className="font-bebas text-2xl text-foreground">
                  ${formatMoney(spend.avgPerMeal)}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      )}
```

(`todayStr` ya está importado en este archivo — verificar; si no, importarlo de `@calistenia/core/lib/dateUtils`.)

- [ ] **Step 4: i18n** — keys FLAT en ambos locales:

es: `"nutrition.spend.kicker": "Gasto", "nutrition.spend.today": "Hoy", "nutrition.spend.week": "Semana", "nutrition.spend.perMeal": "Prom/comida"`
en: `"nutrition.spend.kicker": "Spend", "nutrition.spend.today": "Today", "nutrition.spend.week": "Week", "nutrition.spend.perMeal": "Avg/meal"`

- [ ] **Step 5: Typecheck + lint + commit**

```bash
cd /tmp/wt-f5-dash/apps/mobile && npx tsc --noEmit && npx expo lint
git -C /tmp/wt-f5-dash add apps/mobile/src/app/\(tabs\)/nutrition.tsx apps/mobile/src/components/nutrition/NutritionDashboard.tsx packages/core/locales/es/translation.json packages/core/locales/en/translation.json
git -C /tmp/wt-f5-dash commit -m "feat(despensa): bloque Gasto + badge \$/comida en dashboard (#174)"
```

---

# Integración final (agente principal, NO subagente)

- [ ] Merge en orden B → A → C → D a `feat/pantry-receipts` (`git merge --no-ff wt/f5-*`); resolver el conflicto esperado en `usePantry.ts` (B añade invalidación en onSettled de consume/adjust; C reescribe `useAddPantryItems` — ambos cambios conviven) y en locales (unión de keys).
- [ ] `git worktree remove` los 4 worktrees y borrar ramas `wt/f5-*`.
- [ ] Verificación cruzada en el repo principal: `npx tsc --noEmit` en `apps/mobile` y `mcp-server`, `npx vitest run` en `packages/core`, `npx expo lint`.
- [ ] Re-smoke del endpoint contra OpenAI desde el repo principal (mismo curl de A5).
- [ ] `/code-review` del diff completo; aplicar fixes.
- [ ] Preparar stack de device test (PB + AI API + Metro + adb reverses — receta en handoff post-F4) y avisar a Guillermo: él maneja la UI (regla: sin adb tap/type).
- [ ] Device test manual (Guillermo): recibo real → ≥80% líneas de comida con precio → confirmar → items `source: "receipt"` + `price_source: "real"` → loguear comida → descontar (F4) → badge ≈$ en el entry + bloque Gasto. Probar recibo borroso/no-recibo (error visible + evento Sentry).
- [ ] PR "closes #174", squash-merge con `--admin` (check Dependency review roto).
- [ ] Chore post-merge: subir prompt `receipt-parser` a Langfuse (manual, junto a los 2 pendientes de F1/F4).

## Fuera de scope (V2 de la épica #153)

Cruce gasto↔training, delivery-vs-cocinar, precios por tienda, plan mensual, web parity. Badge $ en días de semanas pasadas (el hook V1 solo trae la semana actual).
