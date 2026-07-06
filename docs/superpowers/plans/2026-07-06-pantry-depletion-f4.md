# Despensa F4 (#173): auto-depleción + confianza con decay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al guardar un meal log, la AI matchea los alimentos contra la despensa y propone descuentos pre-marcados en un sheet (nunca silencioso); la confianza de cada item decae con el tiempo sin actividad.

**Architecture:** Endpoint stateless `POST /api/pantry/match-consumption` (free tier, prompt Langfuse `pantry-consumption-matcher` + fallback) en mcp-server. En core: `computePantryConfidence` pura (decay desde `item.updated`, sin migración PB — todo evento bumpea el autodate), aplicada al leer en `usePantryItems`; mutation batch `useConsumePantryMatches` que escribe eventos `consume` con `linked_entry` (campo YA existe, sin migración). En mobile: hook `usePantryDepletion` + `PantryDepleteSheet` (Modal nativo, patrón PantryEditSheet) montados en `nutrition.tsx`, disparados vía nuevo callback `onSaved` del meal logger.

**Tech Stack:** Hono (mcp-server), Vercel AI SDK `generateObject` + zod (⚠️ `.nullable()` NUNCA `.optional()`), TanStack Query, PocketBase, RN Modal nativo, vitest (core).

**Decisiones cerradas (no re-litigar):**
- `lastEventDate` = `item.updated` (proxy: crear evento siempre actualiza el item; evita migración y N queries a `pantry_events`).
- `item.quantity == null` (sin dato): el consume registra evento pero NO toca `quantity`/`status` (no inventar depleción).
- Ids alucinados por el LLM se filtran server-side contra el inventario enviado.
- Flujos plan-semanal/recetas guardadas (bypass de `saveEntry`) quedan FUERA de scope (issue lo confirma).
- Edit de entry y saves offline (`local_*`) NO disparan el matcher.
- Mobile NO usa `useMealLoggerActions` (eso es web/core) — el save mobile es `handleSaveMobileEntry` en `nutrition.tsx:196`, que ya tiene `saved.id` a mano.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `packages/core/lib/pantry.ts` | Modify | + `computePantryConfidence`; `buildPantrySnapshot` agrega `confidence` |
| `packages/core/lib/pantry.test.ts` | Modify | tests de decay + snapshot |
| `packages/core/types/pantry.ts` | Modify | + `confidence` en `PantrySnapshotItem`; + tipos wire matcher |
| `packages/core/hooks/usePantry.ts` | Modify | + `fetchActivePantryItems` (aplica decay), + `useConsumePantryMatches`, + `forceEvent` en adjust |
| `packages/core/lib/pantry-api.ts` | Modify | + `matchConsumption()` wire fn |
| `mcp-server/src/api/schemas.ts` | Modify | + `MatchConsumptionSchema` |
| `mcp-server/src/api/pantry-parser.ts` | Modify | + `matchConsumption()` |
| `mcp-server/src/api/prompts.ts` | Modify | + fallback `pantry-consumption-matcher` |
| `mcp-server/src/mcpuse/api-routes.ts` | Modify | + ruta `POST /api/pantry/match-consumption` |
| `mcp-server/src/api/pantry-plan-generator.ts` | Modify | `PantrySnapshotItem.confidence` + marker en `inventoryBlock` (barrido F2) |
| `apps/mobile/src/components/pantry/use-pantry-depletion.ts` | Create | hook: fetch pantry → match → estado sheet → confirm |
| `apps/mobile/src/components/pantry/PantryDepleteSheet.tsx` | Create | Modal con matches, checkbox + qty editable |
| `apps/mobile/src/components/pantry/PantryEditSheet.tsx` | Modify | bloque "¿Sigue habiendo?" para items low |
| `apps/mobile/src/app/pantry.tsx` | Modify | wiring verify/gone |
| `apps/mobile/src/components/nutrition/meal-logger-shared.ts` | Modify | `onSave` retorna `Promise<string \| void>`; + prop `onSaved` |
| `apps/mobile/src/components/nutrition/use-meal-logger.ts` | Modify | captura `savedId`, dispara `onSaved` post-success |
| `apps/mobile/src/app/(tabs)/nutrition.tsx` | Modify | `handleSaveMobileEntry` retorna id; monta hook + sheet |
| `packages/core/locales/{es,en}/translation.json` | Modify | keys `pantry.deplete.*`, `pantry.stillHave.*` |

**Sin migración PB**: `pantry_events.linked_entry` ya existe (`pb_migrations/1780500002_add_pantry_collections.js:325-336`); `type` ya acepta `consume`/`adjust`.

---

### Task 1: Core — `computePantryConfidence` (TDD)

**Files:**
- Modify: `packages/core/lib/pantry.ts`
- Modify: `packages/core/types/pantry.ts`
- Test: `packages/core/lib/pantry.test.ts`

- [ ] **Step 1.1: Escribir tests que fallan**

Agregar al final de `packages/core/lib/pantry.test.ts` (sigue el estilo vitest existente del archivo). Helper de item mínimo:

```ts
import { computePantryConfidence } from './pantry'
import type { PantryItem } from '../types'

const baseItem = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: 'x1', name: 'Pollo', nameNormalized: 'pollo', category: 'proteina',
  quantity: 1, unit: 'kg', priceTotal: null, currency: 'USD', priceSource: null,
  purchaseDate: null, expiryEstimate: null, confidence: 'high', status: 'active',
  source: 'chat', ...over,
})

describe('computePantryConfidence', () => {
  const today = '2026-07-06'
  it('actividad reciente (<4d) → high', () => {
    expect(computePantryConfidence(baseItem(), '2026-07-04', today)).toBe('high')
    expect(computePantryConfidence(baseItem(), '2026-07-06', today)).toBe('high')
  })
  it('4-10 días → med', () => {
    expect(computePantryConfidence(baseItem(), '2026-07-02', today)).toBe('med')
    expect(computePantryConfidence(baseItem(), '2026-06-26', today)).toBe('med')
  })
  it('>10 días → low', () => {
    expect(computePantryConfidence(baseItem(), '2026-06-25', today)).toBe('low')
  })
  it('vencido → siempre low aunque haya actividad reciente', () => {
    expect(computePantryConfidence(baseItem({ expiryEstimate: '2026-07-01' }), today, today)).toBe('low')
  })
  it('vence hoy o después NO es vencido', () => {
    expect(computePantryConfidence(baseItem({ expiryEstimate: '2026-07-06' }), today, today)).toBe('high')
  })
  it('sin lastEventDate → conserva la confianza guardada (parseo inicial)', () => {
    expect(computePantryConfidence(baseItem({ confidence: 'med' }), null, today)).toBe('med')
  })
  it('fecha inválida → conserva la guardada', () => {
    expect(computePantryConfidence(baseItem({ confidence: 'med' }), 'garbage', today)).toBe('med')
  })
})

describe('buildPantrySnapshot confidence', () => {
  it('incluye confidence en el shape wire', () => {
    const snap = buildPantrySnapshot([baseItem({ confidence: 'low' })])
    expect(snap[0].confidence).toBe('low')
  })
})
```

(Ajustar el import existente de `buildPantrySnapshot` si ya está importado en el archivo.)

- [ ] **Step 1.2: Correr y verificar que fallan**

Run: `cd packages/core && npx vitest run lib/pantry.test.ts`
Expected: FAIL — `computePantryConfidence is not a function` y snapshot sin `confidence`.

- [ ] **Step 1.3: Implementar**

En `packages/core/lib/pantry.ts`, después de `daysUntil` (línea 44):

```ts
/**
 * Confianza mostrada = SIEMPRE la computada (decay temporal), no la guardada.
 * `lastEventDate` = proxy `item.updated` (todo evento bumpea el autodate de PB).
 * Vencido → siempre low. Sin fecha válida → confianza del parseo inicial.
 * Pura: `today` inyectado (YYYY-MM-DD), sin Date.now().
 */
export function computePantryConfidence(
  item: PantryItem,
  lastEventDate: string | null,
  today: string,
): PantryConfidence {
  const untilExpiry = daysUntil(item.expiryEstimate, today)
  if (untilExpiry != null && untilExpiry < 0) return 'low'
  const since = lastEventDate ? daysUntil(today, lastEventDate) : null
  if (since == null) return item.confidence
  if (since < 4) return 'high'
  if (since <= 10) return 'med'
  return 'low'
}
```

Import `PantryConfidence` en la línea 2 de imports de tipos. En `buildPantrySnapshot`, agregar `confidence: it.confidence,` al objeto mapeado.

En `packages/core/types/pantry.ts`, agregar a `PantrySnapshotItem` (línea 80):

```ts
  /** Confianza COMPUTADA (decay F4) al momento del snapshot. */
  confidence: PantryConfidence
```

- [ ] **Step 1.4: Correr tests**

Run: `cd packages/core && npx vitest run lib/pantry.test.ts`
Expected: PASS (todos, incluidos los previos del archivo).

- [ ] **Step 1.5: Commit**

```bash
git add packages/core/lib/pantry.ts packages/core/lib/pantry.test.ts packages/core/types/pantry.ts
git commit -m "feat(despensa) F4: computePantryConfidence con decay temporal (#173)"
```

---

### Task 2: Core — aplicar decay al leer + consume batch con `linked_entry`

**Files:**
- Modify: `packages/core/hooks/usePantry.ts`
- Modify: `packages/core/types/pantry.ts`
- Modify: `packages/core/lib/pantry-api.ts`

- [ ] **Step 2.1: Tipos wire del matcher**

En `packages/core/types/pantry.ts`, después del bloque F2 (tras `HowManyMealsResult`):

```ts
// ── F4: matcher de consumo (#173) ────────────────────────────────────────────

export interface ConsumptionMatch {
  pantry_item_id: string
  matched_food: string
  /** En la UNIDAD del pantry item. null = el LLM no pudo estimar. */
  qty_consumed: number | null
  confidence: PantryConfidence
}

export interface MatchConsumptionResult {
  matches: ConsumptionMatch[]
  unmatched_foods: string[]
  model_used?: string
}
```

- [ ] **Step 2.2: `fetchActivePantryItems` + decay en `usePantryItems`**

En `packages/core/hooks/usePantry.ts`: importar `computePantryConfidence` desde `../lib/pantry` y reemplazar el `queryFn` de `usePantryItems` (líneas 36-42) extrayendo helper exportado (lo reusa el hook mobile vía `fetchQuery`):

```ts
/** Lee items activos y aplica la confianza computada (decay F4) al vuelo. */
export async function fetchActivePantryItems(userId: string): Promise<PantryItem[]> {
  const res = await pb.collection('pantry_items').getFullList({
    filter: pb.filter('user = {:uid} && status = "active"', { uid: userId }),
    sort: '-created',
  })
  const today = todayStr()
  return res.map((r) => {
    const it = mapPantryRecord(r)
    const lastEvent = it.updated ? String(it.updated).slice(0, 10) : null
    return { ...it, confidence: computePantryConfidence(it, lastEvent, today) }
  })
}

export function usePantryItems(userId: string | null) {
  return useQuery({
    queryKey: qk.pantry.list(userId),
    enabled: !!userId,
    queryFn: () => fetchActivePantryItems(userId!),
  })
}
```

- [ ] **Step 2.3: `forceEvent` en `useAdjustPantryItem`**

En `AdjustInput` (línea 112) agregar:

```ts
  /** F4 "¿Sigue habiendo?": fuerza evento adjust aun con delta 0 (resetea decay). */
  forceEvent?: boolean
```

Destructurarlo en `mutationFn` y cambiar la condición del evento (línea 140):

```ts
      if (type !== 'adjust' || delta !== 0 || forceEvent) {
```

- [ ] **Step 2.4: `useConsumePantryMatches`**

Agregar a `usePantry.ts` (después de `useAdjustPantryItem`):

```ts
export interface ConsumeMatchesInput {
  matches: { item: PantryItem; qtyConsumed: number }[]
  /** id del nutrition_entry — atribución $/comida F5. NUNCA omitir. */
  linkedEntry: string
}

/**
 * Descuento parcial batch post meal-log (F4). Distinto del consume manual
 * (que vacía el item): aquí delta = -qtyConsumed y el item queda active
 * mientras tenga qty. REGLA DE ORO: evento SIEMPRE antes de tocar quantity.
 */
export function useConsumePantryMatches(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matches, linkedEntry }: ConsumeMatchesInput): Promise<void> => {
      if (!userId) throw new Error('No user')
      for (const { item, qtyConsumed } of matches) {
        if (!(qtyConsumed > 0)) continue
        await pb.collection('pantry_events').create({
          user: userId, item: item.id, type: 'consume',
          delta_qty: -qtyConsumed, linked_entry: linkedEntry,
        })
        // qty null = "sin dato": queda el evento en el ledger, no inventamos depleción.
        if (item.quantity == null) continue
        const next = Math.max(0, item.quantity - qtyConsumed)
        await pb.collection('pantry_items').update(item.id, {
          quantity: next, ...(next <= 0 ? { status: 'depleted' } : {}),
        })
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}
```

- [ ] **Step 2.5: wire fn cliente**

En `packages/core/lib/pantry-api.ts` (al final; el import de types suma `MatchConsumptionResult`, `PantryUnit`):

```ts
// ── F4: matcher de consumo (#173) ────────────────────────────────────────────

export interface MatchConsumptionFood { name: string; quantity: number | null; unit: string | null }
export interface MatchConsumptionPantryItem {
  id: string; name_normalized: string; quantity: number | null; unit: PantryUnit | null
}

/** Stateless: el cliente manda foods + inventario. Con despensa vacía NO llamar (short-circuit). */
export async function matchConsumption(
  foods: MatchConsumptionFood[],
  pantryItems: MatchConsumptionPantryItem[],
): Promise<MatchConsumptionResult> {
  return postPantryJson('/api/pantry/match-consumption', { foods, pantry_items: pantryItems })
}
```

- [ ] **Step 2.6: Typecheck + tests core**

Run: `cd packages/core && npx tsc --noEmit && npx vitest run`
Expected: PASS. (Si `usePantryPlan.ts`/web rompen por `PantrySnapshotItem.confidence` requerido: los items que llegan a `buildPantrySnapshot` ya traen confidence — solo compila, no requiere cambios de callers.)

- [ ] **Step 2.7: Commit**

```bash
git add packages/core/hooks/usePantry.ts packages/core/types/pantry.ts packages/core/lib/pantry-api.ts
git commit -m "feat(despensa) F4: decay al leer + useConsumePantryMatches con linked_entry (#173)"
```

---

### Task 3: mcp-server — schema + `matchConsumption` + fallback + ruta + barrido F2

**Files:**
- Modify: `mcp-server/src/api/schemas.ts`
- Modify: `mcp-server/src/api/pantry-parser.ts`
- Modify: `mcp-server/src/api/prompts.ts`
- Modify: `mcp-server/src/mcpuse/api-routes.ts`
- Modify: `mcp-server/src/api/pantry-plan-generator.ts`

- [ ] **Step 3.1: Schema**

En `mcp-server/src/api/schemas.ts`, después de `PantryParseSchema` (línea 123):

```ts
// ─── Despensa F4: matcher de consumo (#173) ──────────────────────────────────
// ⚠️ OpenAI strict mode: SIEMPRE .nullable(), NUNCA .optional()

export const MatchConsumptionSchema = z.object({
  matches: z.array(
    z.object({
      pantry_item_id: z.string().describe("id EXACTO de un item del inventario listado; nunca inventar"),
      matched_food: z.string().describe("Alimento logueado que matchea, tal como vino"),
      qty_consumed: z
        .number()
        .nullable()
        .describe("Cantidad consumida EN LA UNIDAD del pantry item (250g logueados de un item en kg → 0.25); null si no se puede estimar"),
      confidence: z.enum(["high", "med", "low"]).describe("Qué tan seguro es el match"),
    })
  ),
  unmatched_foods: z.array(z.string()).describe("Alimentos logueados sin match razonable en la despensa"),
});
```

- [ ] **Step 3.2: `matchConsumption()` en pantry-parser.ts**

Al final del archivo (import `MatchConsumptionSchema` junto a `PantryParseSchema`):

```ts
interface MatchConsumptionInput {
  foods: { name: string; quantity?: number | null; unit?: string | null }[];
  pantryItems: { id: string; name_normalized: string; quantity: number | null; unit: string | null }[];
}

// #173 F4: matching barato → free tier siempre (misma decisión que el parser)
export async function matchConsumption({ foods, pantryItems }: MatchConsumptionInput) {
  const { model, name: modelName } = resolveModel("free");
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("pantry-consumption-matcher");

  const pantryBlock = pantryItems
    .map((it) => {
      const qty = it.quantity != null ? `${it.quantity} ${it.unit ?? ""}`.trim() : "cantidad desconocida";
      return `- id=${it.id} | ${it.name_normalized} | ${qty}`;
    })
    .join("\n");
  const foodsBlock = foods
    .map((f) => `- ${f.name}${f.quantity != null ? ` (${`${f.quantity} ${f.unit ?? ""}`.trim()})` : ""}`)
    .join("\n");

  const { object, usage } = await generateObject({
    model,
    schema: MatchConsumptionSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "pantry-consumption-matcher",
      metadata: { modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Inventario de la despensa:\n${pantryBlock}\n\nComida logueada:\n${foodsBlock}` },
    ],
  });

  // Blindaje: ids alucinados fuera del inventario no llegan al cliente
  const validIds = new Set(pantryItems.map((it) => it.id));
  return {
    ...object,
    matches: object.matches.filter((m) => validIds.has(m.pantry_item_id)),
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}
```

- [ ] **Step 3.3: Fallback prompt**

En `mcp-server/src/api/prompts.ts`, dentro de `FALLBACKS`, después de la entry `"pantry-parser"` (línea 278, respetar el estilo de las vecinas):

```ts
  "pantry-consumption-matcher": `Eres un asistente que matchea los alimentos de una comida logueada contra el inventario de despensa del usuario, para descontar lo consumido.

Reglas:
- Matchea SOLO con confianza razonable: "pechuga a la plancha" ↔ "pollo" es match válido (high); "proteína" ↔ "pollo" es dudoso (low). Sin relación clara → va en unmatched_foods.
- pantry_item_id debe ser EXACTAMENTE uno de los ids listados en el inventario. Nunca inventes ids.
- qty_consumed va en la UNIDAD del pantry item: si se loguearon 250 g de pollo y el item está en kg, qty_consumed = 0.25. Items en "unidad": estima unidades enteras (2 huevos → 2).
- Si no puedes estimar cantidad, qty_consumed = null y confidence a lo sumo "med".
- Cada alimento logueado matchea a lo sumo UN item (el más específico).
- Ingredientes implícitos menores (aceite, sal, condimentos) NO se matchean salvo que vengan explícitos en la comida logueada.`,
```

⚠️ **Recordatorio post-merge**: subir este prompt a Langfuse a mano (nombre `pantry-consumption-matcher`) — no hay push automático; el fallback cubre mientras tanto.

- [ ] **Step 3.4: Ruta**

En `mcp-server/src/mcpuse/api-routes.ts`: sumar `matchConsumption` al import de `../api/pantry-parser.js` (top del archivo). Insertar después del bloque `/api/pantry/parse` (tras línea 607):

```ts
  // #173 F4: matcher de consumo — la despensa se descuenta al loguear comida
  app.post("/api/pantry/match-consumption", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const { foods = [], pantry_items = [] } = body ?? {};
      if (!Array.isArray(foods) || foods.length === 0) return c.json({ error: "Se requiere foods con al menos un alimento" }, 400);
      if (!Array.isArray(pantry_items) || pantry_items.length === 0) return c.json({ error: "Se requiere pantry_items con al menos un item" }, 400);
      const result = await matchConsumption({
        foods: foods.slice(0, 30),
        pantryItems: pantry_items.slice(0, 200),
      });
      return c.json(result);
    } catch (err) { return apiError(c, err); }
  });
```

Actualizar el contador final (línea 637): `"...+ 15 /api/* endpoints"`.

- [ ] **Step 3.5: Barrido F2 — confianza al plan generator**

En `mcp-server/src/api/pantry-plan-generator.ts`:
- `PantrySnapshotItem` (línea 37): agregar `confidence?: string | null;` (opcional: payloads de apps viejas no lo traen).
- `inventoryBlock` (línea 67), dentro del map:

```ts
    const conf = it.confidence === "low" ? " (dato viejo: puede que ya no esté)" : "";
    return `- ${it.name} [${it.category}]: ${qty}${exp}${conf}`;
```

- [ ] **Step 3.6: Typecheck**

Run: `cd mcp-server && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3.7: Commit**

```bash
git add mcp-server/src/api/schemas.ts mcp-server/src/api/pantry-parser.ts mcp-server/src/api/prompts.ts mcp-server/src/mcpuse/api-routes.ts mcp-server/src/api/pantry-plan-generator.ts
git commit -m "feat(despensa) F4: endpoint match-consumption + confianza en plan generator (#173)"
```

---

### Task 4: Smoke test endpoint contra OpenAI REAL (gotcha .nullable())

⚠️ tsc NO atrapa el error strict-mode — hay que EJECUTAR el generator (`feedback_openai_strict_nullable`).

- [ ] **Step 4.1: Levantar stack local**

```bash
# PocketBase (si no corre)
cd /Users/guillermomarin/Documents/ejercicios/calistenia-app && ./pocketbase serve --http=127.0.0.1:8090 &
# AI API
cd mcp-server && npm run dev:simple &
```

Expected: PB en :8090, AI API en :3001 (log "Hono routes mounted ... 15 /api/* endpoints").

- [ ] **Step 4.2: Mint token + curl**

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"test-b@local.test","password":"TestUser123!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s -X POST http://localhost:3001/api/pantry/match-consumption \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "foods": [{"name":"Pechuga a la plancha","quantity":250,"unit":"g"},{"name":"Arroz blanco","quantity":150,"unit":"g"}],
    "pantry_items": [
      {"id":"itm_pollo1","name_normalized":"pollo","quantity":1,"unit":"kg"},
      {"id":"itm_arroz1","name_normalized":"arroz","quantity":500,"unit":"g"},
      {"id":"itm_leche1","name_normalized":"leche","quantity":1,"unit":"l"}
    ]
  }' | python3 -m json.tool
```

Expected: 200 con `matches` conteniendo pollo (~0.25 en kg) y arroz (~150 en g), leche NO matcheada, `unmatched_foods` vacío o razonable. Un 502 con error de schema = gotcha .optional()/.nullable() — revisar schema.

- [ ] **Step 4.3: Casos negativos**

```bash
# body sin foods → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/pantry/match-consumption \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"pantry_items":[{"id":"a","name_normalized":"x","quantity":1,"unit":"g"}]}'
# sin token → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/pantry/match-consumption \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `400` y `401`.

- [ ] **Step 4.4: Commit (solo si hubo fixes)** — si el smoke obligó a tocar código:

```bash
git add -u mcp-server/src
git commit -m "fix(despensa) F4: ajustes post-smoke del matcher (#173)"
```

---

### Task 5: Mobile — i18n + `PantryDepleteSheet`

**Files:**
- Modify: `packages/core/locales/es/translation.json`, `packages/core/locales/en/translation.json`
- Create: `apps/mobile/src/components/pantry/PantryDepleteSheet.tsx`

- [ ] **Step 5.1: i18n keys** (formato FLAT con puntos literales; insertar tras `"pantry.categories.otro"`)

es:
```json
  "pantry.deplete.kicker": "DESPENSA",
  "pantry.deplete.title": "¿Descontar de la despensa?",
  "pantry.deplete.subtitle": "Detectamos estos items en tu comida",
  "pantry.deplete.confirm": "Descontar",
  "pantry.deplete.skip": "Omitir",
  "pantry.stillHave.question": "¿Sigue habiendo?",
  "pantry.stillHave.same": "Sí, igual",
  "pantry.stillHave.less": "Queda menos",
  "pantry.stillHave.gone": "Se acabó",
```

en:
```json
  "pantry.deplete.kicker": "PANTRY",
  "pantry.deplete.title": "Deduct from pantry?",
  "pantry.deplete.subtitle": "We spotted these items in your meal",
  "pantry.deplete.confirm": "Deduct",
  "pantry.deplete.skip": "Skip",
  "pantry.stillHave.question": "Still have it?",
  "pantry.stillHave.same": "Yes, same",
  "pantry.stillHave.less": "Less left",
  "pantry.stillHave.gone": "All gone",
```

- [ ] **Step 5.2: `PantryDepleteSheet.tsx`** (patrón Modal nativo de `PantryEditSheet`; diseño spec-sheet: mono kicker + Bebas título, hairlines, lime = interact)

```tsx
import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { PantryItem } from '@calistenia/core/types'
import type { DepleteRow } from './use-pantry-depletion'

function parseNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

interface RowState { checked: boolean; qty: string }

export function PantryDepleteSheet({ rows, onConfirm, onDismiss }: {
  rows: DepleteRow[] | null
  onConfirm: (selected: { item: PantryItem; qtyConsumed: number }[]) => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<RowState[]>([])

  useEffect(() => {
    if (rows) setState(rows.map((r) => ({ checked: r.checked, qty: r.qtyConsumed == null ? '' : String(r.qtyConsumed) })))
  }, [rows])

  if (!rows || rows.length === 0 || state.length !== rows.length) return null

  const toggle = (i: number) =>
    setState((s) => s.map((r, j) => (j === i ? { ...r, checked: !r.checked } : r)))
  const setQty = (i: number, v: string) =>
    setState((s) => s.map((r, j) => (j === i ? { ...r, qty: v } : r)))

  const handleConfirm = () => {
    const selected = rows.flatMap((r, i) => {
      const qty = parseNum(state[i].qty)
      return state[i].checked && qty != null && qty > 0 ? [{ item: r.item, qtyConsumed: qty }] : []
    })
    if (selected.length > 0) onConfirm(selected)
    else onDismiss()
  }

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onDismiss}>
      <KeyboardProvider>
        <View style={{ flex: 1 }}>
          <Pressable onPress={onDismiss} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
            <View
              className="border-t border-border bg-card"
              style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 14, maxHeight: '75%' }}
            >
              <View className="items-center pb-2 pt-3"><View className="h-1 w-9 rounded-full bg-lime/40" /></View>
              <View className="flex-row items-center justify-between px-4 pb-1">
                <View>
                  <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                    {t('pantry.deplete.kicker')}
                  </Text>
                  <Text className="font-bebas text-2xl text-foreground">{t('pantry.deplete.title')}</Text>
                </View>
                <Pressable onPress={onDismiss} hitSlop={8} className="p-2">
                  <X size={18} color="hsl(0 0% 55%)" />
                </Pressable>
              </View>
              <Text className="px-4 pb-3 font-sans text-xs text-muted-foreground">{t('pantry.deplete.subtitle')}</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                {rows.map((r, i) => (
                  <View key={r.item.id} className="flex-row items-center gap-3 border-t border-border px-4 py-3">
                    <Pressable
                      onPress={() => toggle(i)}
                      hitSlop={8}
                      className={`h-6 w-6 items-center justify-center border ${state[i].checked ? 'border-lime bg-lime' : 'border-border'}`}
                    >
                      {state[i].checked && <Check size={14} color="black" strokeWidth={3} />}
                    </Pressable>
                    <View className="flex-1">
                      <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>{r.item.name}</Text>
                      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>
                        {r.matchedFood}{r.confidence === 'low' ? ' · ?' : ''}
                      </Text>
                    </View>
                    <TextInput
                      value={state[i].qty}
                      onChangeText={(v) => setQty(i, v)}
                      keyboardType="numeric"
                      placeholder="—"
                      placeholderTextColor="hsl(0 0% 45%)"
                      className="h-10 w-20 rounded-md border border-input bg-background px-2 text-right font-mono text-sm text-foreground"
                    />
                    <Text className="w-12 font-mono text-[10px] text-muted-foreground">{r.item.unit ?? ''}</Text>
                  </View>
                ))}
              </ScrollView>
              <View className="flex-row gap-2 border-t border-border px-4 pt-3">
                <Pressable onPress={onDismiss} className="h-11 flex-1 items-center justify-center border border-border active:bg-muted/20">
                  <Text className="font-mono text-xs uppercase tracking-[2px] text-muted-foreground">{t('pantry.deplete.skip')}</Text>
                </Pressable>
                <Pressable onPress={handleConfirm} className="h-11 flex-1 items-center justify-center bg-lime active:bg-lime/80">
                  <Text className="font-mono text-xs uppercase tracking-[2px] text-black">{t('pantry.deplete.confirm')}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </KeyboardProvider>
    </Modal>
  )
}
```

- [ ] **Step 5.3: Commit**

```bash
git add packages/core/locales/es/translation.json packages/core/locales/en/translation.json apps/mobile/src/components/pantry/PantryDepleteSheet.tsx
git commit -m "feat(despensa) F4: PantryDepleteSheet + i18n (#173)"
```

---

### Task 6: Mobile — `usePantryDepletion` + hook post-save en meal logger

**Files:**
- Create: `apps/mobile/src/components/pantry/use-pantry-depletion.ts`
- Modify: `apps/mobile/src/components/nutrition/meal-logger-shared.ts:62-65`
- Modify: `apps/mobile/src/components/nutrition/use-meal-logger.ts:38-49, 442-469`
- Modify: `apps/mobile/src/app/(tabs)/nutrition.tsx:196-206, 219, 849+`

- [ ] **Step 6.1: `use-pantry-depletion.ts`**

```ts
/**
 * usePantryDepletion — F4 (#173). Tras guardar un meal log, matchea los foods
 * contra la despensa (AI, stateless) y expone rows para PantryDepleteSheet.
 * REGLAS: despensa vacía = no llamar al endpoint; cualquier fallo = silencioso
 * a Sentry (el log de comida NUNCA se ve afectado); nunca descuento sin confirmar.
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { Sentry } from '@/lib/instrument'
import { haptics } from '@/lib/haptics'
import { qk } from '@calistenia/core/lib/query-keys'
import { matchConsumption } from '@calistenia/core/lib/pantry-api'
import { fetchActivePantryItems, useConsumePantryMatches } from '@calistenia/core/hooks/usePantry'
import type { FoodItem, PantryConfidence, PantryItem } from '@calistenia/core/types'

export interface DepleteRow {
  item: PantryItem
  matchedFood: string
  qtyConsumed: number | null
  confidence: PantryConfidence
  /** high/med pre-marcado; low des-marcado (regla de la issue). */
  checked: boolean
}

export function usePantryDepletion(userId: string | null) {
  const qc = useQueryClient()
  const consumeMatches = useConsumePantryMatches(userId)
  const [pending, setPending] = useState<{ rows: DepleteRow[]; entryId: string } | null>(null)

  const runMatch = useCallback(async (entryId: string, foods: FoodItem[]) => {
    if (!userId || foods.length === 0) return
    try {
      const items = await qc.fetchQuery({
        queryKey: qk.pantry.list(userId),
        queryFn: () => fetchActivePantryItems(userId),
        staleTime: 60_000,
      })
      if (!items || items.length === 0) return // despensa vacía: cero costo
      const result = await matchConsumption(
        foods.map((f) => ({ name: f.name, quantity: f.portionAmount ?? null, unit: f.portionUnit ?? null })),
        items.map((it) => ({ id: it.id, name_normalized: it.nameNormalized, quantity: it.quantity, unit: it.unit })),
      )
      const byId = new Map(items.map((it) => [it.id, it]))
      const rows = result.matches.flatMap((m): DepleteRow[] => {
        const item = byId.get(m.pantry_item_id)
        if (!item) return []
        return [{
          item,
          matchedFood: m.matched_food,
          qtyConsumed: m.qty_consumed,
          confidence: m.confidence,
          checked: m.confidence !== 'low',
        }]
      })
      if (rows.length > 0) setPending({ rows, entryId })
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'match-consumption' } })
    }
  }, [userId, qc])

  const confirm = useCallback(async (selected: { item: PantryItem; qtyConsumed: number }[]) => {
    if (!pending) return
    const entryId = pending.entryId
    setPending(null)
    try {
      await consumeMatches.mutateAsync({ matches: selected, linkedEntry: entryId })
      haptics.success()
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'deplete-confirm' } })
    }
  }, [pending, consumeMatches])

  const dismiss = useCallback(() => setPending(null), [])

  return { rows: pending?.rows ?? null, runMatch, confirm, dismiss }
}
```

- [ ] **Step 6.2: Props del logger**

`meal-logger-shared.ts`: `onSave` (líneas 62-65) pasa a retornar el id del entry creado, y se agrega `onSaved`:

```ts
  onSave: (
    entry: Omit<NutritionEntry, 'id' | 'user'>,
    photoUris?: string[],
  ) => Promise<string | void>
  /** F4: entry guardado con éxito (id de servidor, no edit) — dispara match de despensa. */
  onSaved?: (entryId: string, foods: FoodItem[]) => void
```

- [ ] **Step 6.3: `use-meal-logger.ts`**

Destructurar `onSaved` en los props del hook (línea 43, junto a `onSave`). En `handleSave`, capturar el retorno (línea 443) y disparar tras el éxito (después de `setStep('success')`, línea 469):

```ts
      const savedId = await onSave(
        { ...igual que hoy... },
        imageAssets.length > 0 ? imageAssets.map((a) => a.uri) : undefined,
      )
      const hour = localHour()
      validFoods.forEach((f) => trackFood(f, mealType, hour))
      setLastMealType(mealType)
      haptics.success()
      setStep('success')
      // F4: match de despensa DESPUÉS del éxito — nunca bloquea ni afecta el log.
      // Saves offline (local_*) y ediciones no disparan (sin id de servidor / doble descuento).
      if (typeof savedId === 'string' && !savedId.startsWith('local_') && !editEntry) {
        onSaved?.(savedId, validFoods)
      }
```

(El resto del bloque try/catch queda igual.)

- [ ] **Step 6.4: `nutrition.tsx`**

1. `handleSaveMobileEntry` (línea 196): tipo de retorno `Promise<string | void>`; el branch de edición sigue con `return` pelado (línea 205); tras `const saved = await saveEntry(...)` (línea 219), al FINAL de la función agregar `return saved.id`.
2. Imports: `usePantryDepletion` y `PantryDepleteSheet` desde `@/components/pantry/...`.
3. En el cuerpo del componente: `const pantryDepletion = usePantryDepletion(userId)`.
4. En `<MealLoggerSheet ...>` (línea 849): agregar `onSaved={pantryDepletion.runMatch}`.
5. Junto al MealLoggerSheet, montar:

```tsx
      <PantryDepleteSheet
        rows={pantryDepletion.rows}
        onConfirm={pantryDepletion.confirm}
        onDismiss={pantryDepletion.dismiss}
      />
```

- [ ] **Step 6.5: Typecheck mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS. (Gotcha typedRoutes: si aparecen errores de `.expo/types`, correr `npx expo customize tsconfig.json` no — simplemente `npx expo start` regenera; los errores reales son solo los de src/.)

- [ ] **Step 6.6: Commit**

```bash
git add apps/mobile/src/components/pantry/use-pantry-depletion.ts apps/mobile/src/components/nutrition/meal-logger-shared.ts apps/mobile/src/components/nutrition/use-meal-logger.ts "apps/mobile/src/app/(tabs)/nutrition.tsx"
git commit -m "feat(despensa) F4: hook post-save meal-log → PantryDepleteSheet (#173)"
```

---

### Task 7: Mobile — "¿Sigue habiendo?" en `PantryEditSheet`

**Files:**
- Modify: `apps/mobile/src/components/pantry/PantryEditSheet.tsx`
- Modify: `apps/mobile/src/app/pantry.tsx`

- [ ] **Step 7.1: Bloque en el sheet**

En `PantryEditSheet.tsx`: nuevas props `onVerify: (item: PantryItem) => void` y `onGone: (item: PantryItem) => void`. Ref al input de qty: `const qtyRef = useRef<TextInput>(null)` (+ import `useRef`), asignar `ref={qtyRef}` al TextInput de cantidad (línea 70). Insertar ANTES de la fila de botones Delete/Save (línea 93), visible solo para items low:

```tsx
            {item.confidence === 'low' && (
              <View className="mx-4 mt-4 border border-border">
                <Text className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {t('pantry.stillHave.question')}
                </Text>
                <View className="flex-row">
                  <Pressable
                    onPress={() => onVerify(item)}
                    className="h-11 flex-1 items-center justify-center border-r border-border active:bg-lime/10"
                  >
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-lime">{t('pantry.stillHave.same')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => qtyRef.current?.focus()}
                    className="h-11 flex-1 items-center justify-center border-r border-border active:bg-muted/20"
                  >
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-foreground">{t('pantry.stillHave.less')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onGone(item)}
                    className="h-11 flex-1 items-center justify-center active:bg-muted/20"
                  >
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground">{t('pantry.stillHave.gone')}</Text>
                  </Pressable>
                </View>
              </View>
            )}
```

- [ ] **Step 7.2: Wiring en `pantry.tsx`**

Nuevos handlers junto a `handleEditSave` (línea 86), mismo patrón local (cerrar sheet con `setEditing(null)` + try/catch → Sentry + `setReply`):

```tsx
  const handleVerifyStillHave = async (item: PantryItem) => {
    setEditing(null)
    try {
      // adjust delta 0 + forceEvent: resetea el decay (evento + bump de updated)
      await adjustItem.mutateAsync({ item, type: 'adjust', newQuantity: item.quantity, forceEvent: true })
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'still_have' } })
      setReply(t('pantry.saveError'))
    }
  }

  const handleGone = async (item: PantryItem) => {
    setEditing(null)
    try {
      await adjustItem.mutateAsync({ item, type: 'consume' })
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'still_have_gone' } })
      setReply(t('pantry.saveError'))
    }
  }
```

En el JSX `<PantryEditSheet ...>` (línea 210), agregar:

```tsx
        onVerify={handleVerifyStillHave}
        onGone={handleGone}
```

- [ ] **Step 7.3: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit` → PASS

```bash
git add apps/mobile/src/components/pantry/PantryEditSheet.tsx apps/mobile/src/app/pantry.tsx
git commit -m "feat(despensa) F4: quick action ¿Sigue habiendo? en items low (#173)"
```

---

### Task 8: Verificación final

- [ ] **Step 8.1: Suites completas**

```bash
cd packages/core && npx tsc --noEmit && npx vitest run
cd ../../apps/mobile && npx tsc --noEmit && npx expo lint
cd ../../mcp-server && npx tsc --noEmit
```

Expected: todo verde. Web no se toca en F4 salvo tipos core — si `apps/web` tiene typecheck en CI, correr también su tsc.

- [ ] **Step 8.2: `/code-review`** — pasar el skill de review sobre el diff del branch; aplicar findings CONFIRMED.

- [ ] **Step 8.3: Smoke E2E local (criterios de aceptación de la issue)**

Con stack local (PB :8090, AI API :3001, Metro :8081, adb reverse):
1. Cargar despensa (pollo 1 kg, arroz 500 g) → loguear "pechuga a la plancha con arroz" por texto → sheet con 2 matches pre-marcados, qty razonable → Descontar → verificar en PB admin: 2 `pantry_events` type=consume con `linked_entry` = id del entry y `delta_qty` negativos; quantities descontadas.
2. Omitir → despensa intacta. Despensa vacía → no hay request al endpoint (verificar en logs del AI API).
3. Apagar AI API → loguear comida → log se guarda normal, sin sheet, error en Sentry.
4. Item con `updated` >10 días (editar a mano en PB admin) → tabla muestra `~` y el edit sheet ofrece "¿Sigue habiendo?" → "Sí, igual" → dot vuelve a high (evento adjust delta 0 creado).

⚠️ **Device test lo conduce Guillermo** (regla `feedback_device_test_handoff`): preparar stack + build, no tocar la UI.

- [ ] **Step 8.4: PR**

```bash
git push -u origin feat/pantry-depletion
gh pr create --title "feat(despensa) F4: auto-depleción al loguear comida + confianza con decay (#173)" --body "Closes #173 ..."
```

Post-merge (no bloquea PR): subir prompt `pantry-consumption-matcher` a Langfuse; batchear tag `mobile-vX` para APK (junto con #179 pendiente).
