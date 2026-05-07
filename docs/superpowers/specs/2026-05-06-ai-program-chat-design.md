# AI Program Chat — Design

**Date:** 2026-05-06
**Branch:** `feat/ai-program-chat`
**Status:** Draft (awaiting user review)
**Related:** `2026-04-07-ai-free-session-design.md` (pattern this design mirrors)

## Goal

Let regular users create a multi-week training program via an AI-assisted chat,
the same way the Free Session tab lets them generate a single workout. Target
user: ignorant of periodization — describes the goal, AI proposes the structure
(weeks, phases, days, exercises). Output is a fully-populated draft loaded into
the existing 4-step editor; user reviews and saves.

Non-goals: official/featured publishing flow (admin-only, separate),
sharing of AI drafts pre-apply, persistence of chat across reloads, an
admin-power version of the chat.

## High-level decisions

| Question | Decision |
|---|---|
| Goal | Quick draft for end users (regular role only). |
| Draft scope | AI decides structure from the goal — weeks, phases, day types, exercises. |
| Entry point | New **IA** tab inside `ProgramEditorPage`, default for new programs. Hidden when editing an existing program. |
| Hand-off | AI streams a **preview card** in chat → user clicks **Aplicar al editor** → editor state hydrated, switches to Manual tab on step 1. |
| First-message UX | Mini form (mirrors `SessionForm`), then chat. |
| Refinement | Chat + chip suggestions; latest `create_program` tool result wins. |
| Fill scope | Everything (info + phases + days + exercises) but the user must explicitly click Apply. |
| Architecture | Single `create_program` tool call (mirrors `create_session` from free-session). |

## Architecture

```
ProgramEditorPage
 ├─ Tabs: "IA" (default for new) | "Manual"
 │   └─ IA tab → AIProgramChat
 │        ├─ ProgramForm        (mini form)
 │        ├─ Conversation       (ai-elements)
 │        ├─ ProgramPreviewCard (rendered from create_program tool result)
 │        └─ ChatInput          (chips + textarea)
 │   └─ Manual tab → existing 4-step wizard (unchanged)
 └─ useProgramEditor.applyAIDraft(draft)  // new method, hydrates state
```

```
mcp-server
 ├─ api/tools/search-exercises.ts        (extracted, shared)
 ├─ api/free-session-generator.ts        (imports searchExercisesTool)
 ├─ api/program-generator.ts             (NEW: handleGenerateProgram + createProgramTool)
 └─ api/index.ts                         (route POST /generate-program)
```

The server never writes to PocketBase. The tool result is a draft envelope only.
Persistence stays in `useProgramEditor.saveProgram`, called after Apply, exactly
as today.

## Data flow

1. User opens `/programs/new` → IA tab is default (no `programId`).
2. **ProgramForm** collects: `goal`, `level`, `daysPerWeek` (2–6), `weeks` (4/8/12/26),
   `equipment[]`, `location`, `availableTime` per session (20–90 min).
   Pre-filled from `user.fitness_level` + `nutrition_goals` (age/weight/height/sex).
3. Submit → `sendMessage({ text: humanSummary })` with `userContext` in
   `DefaultChatTransport.body`.
4. Backend `POST /api/generate-program`:
   - `requireAuth` + `rateLimit` (existing middleware).
   - Loads `program-generator` system prompt from Langfuse (fallback constant).
   - `streamText` with tools `search_exercises` (reused) + `create_program` (new).
   - `maxOutputTokens: 6000`, `stopWhen: stepCountIs(20)`.
   - `pipeUIMessageStreamToResponse(res)`.
5. AI runs N `search_exercises` calls (per category, equipment-aware) → designs
   structure → calls `create_program` once at the end. Sends a brief Spanish
   text explaining the program (no IDs / sets / reps in the text).
6. Frontend renders `ProgramPreviewCard` inline on the assistant message
   containing the latest `create_program` tool result.
7. User refines via chat or chips ("más fácil", "menos días", "agrega pull-ups",
   etc.) → AI re-calls `create_program` → newer tool result replaces preview.
8. User clicks **Aplicar al editor** → `applyAIDraft(toolResult.program)` →
   tab switches to Manual, jumps to step 1, `isDirty=true`.
9. User walks step 1 → 4 in the existing wizard, edits anything, clicks
   **Guardar** (existing `saveProgram` path).

## `create_program` tool schema (zod)

```ts
{
  info: {
    name: string,                         // suggested program name
    description: string,                  // 1–2 sentences
    durationWeeks: number().int().min(1).max(52),
    difficulty: enum("beginner","intermediate","advanced"),
  },
  phases: array(z.object({
    name: string,
    weeks: string,                        // "1-6", "7-13"
    color: enum("lime","sky","pink","amber","red","emerald"),
  })).min(1).max(8),
  days: array(z.object({
    phaseNumber: number().int().min(1),   // 1-based phase index
    dayId: enum("lun","mar","mie","jue","vie","sab","dom"),
    type: enum("push","pull","legs","core","lumbar","full","cardio","yoga","circuit","rest"),
    focus: string,                        // short label (e.g. "Empuje + Core")
    exercises: array(z.object({
      id: string,                         // MUST come from search_exercises
      name: string,                       // populated by AI from search results;
                                          // server overwrites with canonical catalog name
      sets: number().int().min(1).max(10),
      reps: string,
      rest: number().int().min(0).max(300),
      section: enum("warmup","main","cooldown").default("main"),
    })).default([]),
    cardio: z.object({                    // only for type==="cardio"
      activityType: enum("running","walking","cycling"),
      targetDistanceKm: number().optional(),
      targetDurationMin: number().optional(),
    }).optional(),
  })).min(1),
}
```

**Tool `execute`:**
- Loads exercise catalog (same loader as `search_exercises`).
- Drops exercises with unknown IDs; collects them into `invalid_ids`.
- Overwrites each exercise's `name` with the canonical catalog name (frontend
  trusts this and skips its own lookup at Apply time).
- Returns `{ success: boolean, program: <validated draft>, invalid_ids?: string[] }`.

The server does no DB writes.

## Refinement UX

- Below the preview card and in the chat input area, render chip groups
  (rotate based on prior turns):
  - Estructura: `Más días`, `Menos días`, `Programa más corto`, `Programa más largo`
  - Dificultad: `Más fácil`, `Más difícil`
  - Foco: `Más core`, `Más pull`, `Más movilidad`, `Sin saltos`
  - Equipo: `Sin barra`, `Solo peso corporal`
- Chip click = `sendMessage({ text: chipLabel })`.
- Latest `create_program` tool result wins (scan messages from end, pick first
  hit). No state diffing — full replace.
- During regeneration: shimmer card "Ajustando programa…" + dim previous
  preview. Stop button (`status === 'streaming'`) cancels the stream.
- Soft cap: 8 refinement turns per chat (warning toast at 8, no hard block).

## Apply gate

- **Aplicar al editor** button enabled when:
  - The latest assistant message has a successful `create_program` result.
  - Stream not in progress.
- Click → toast `"Programa cargado en el editor. Revisa los 4 pasos y guarda."`,
  switch tab to Manual, jump to step 1, `isDirty=true`.
- Idempotent: clicking again re-applies the latest draft (overwrites editor
  state). If `isDirty` from manual edits made *after* the first Apply, show an
  inline confirm "¿Reemplazar tus cambios manuales?" (no full modal).

## Discarding / re-generation

- If the user switches back to the IA tab after applying and `isDirty` is true,
  show a small banner: `"Estás editando manualmente. Generar otra vez con IA
  reiniciará tu trabajo."` with **Cancelar** / **Reiniciar**.
- The IA tab is hidden when editing an existing program (`programId` set), to
  avoid accidental overwrite of an existing user program.

## `applyAIDraft(draft)` mapping

In `useProgramEditor`:

```ts
applyAIDraft(draft: AIProgramDraft): void
```

- `info` ← `{ name, description, durationWeeks, difficulty, isOfficial: false }`.
- `phases` ← `draft.phases.map(p => ({ name, weeks, color: PALETTE[p.color].color, bgColor: PALETTE[p.color].bgColor }))`.
- If `draft.phases[*].weeks` look unset/inconsistent, fall back to the existing
  `distributeWeeks(durationWeeks, phases.length)`.
- `days` ← start from `buildDefaultDays(phases.length)`, then for each
  `draft.days` entry, override the `${phaseIndex}_${dayId}` slot with
  `type`, `focus`, `cardio*` fields, and `exercises` mapped to `EditorExercise`
  (preserve `section`, default rest=60, default sets/reps from tool, drop
  exercises with empty `name` defensively).
- `step` ← 1, `isDirty` ← true, `programId` stays null, `error` ← null.

The `applyAIDraft` reducer is pure; no PB calls.

## Backend prompt (Spanish, fallback)

System prompt outline (~1.5 K tokens). Loaded from Langfuse key
`program-generator`; the file constant is the fallback.

```
Eres un entrenador experto. Diseñas PROGRAMAS de entrenamiento periodizados
(no sesiones sueltas) usando ÚNICAMENTE ejercicios del catálogo via
search_exercises.

## Flujo OBLIGATORIO
1. Analiza contexto (objetivo, nivel, días/semana, semanas, equipo, ubicación,
   tiempo disponible por sesión).
2. Decide ESTRUCTURA: cuántas fases (1–3 según semanas), qué tipo cada día
   (push/pull/legs/core/full/cardio/yoga/circuit/rest), distribución de focus
   por semana.
3. Para CADA día no-rest, busca ejercicios con search_exercises (varias
   búsquedas por categoría sin filtro de dificultad). Reutiliza resultados
   entre días.
4. Selecciona 4–7 ejercicios principales por día + 2–3 calentamiento
   (movilidad) + 1–2 vuelta a la calma (movilidad/yoga). Ajusta sets/reps/rest
   al nivel.
5. Llama create_program UNA sola vez al final con TODA la estructura.

## Periodización sugerida
- 4 sem  → 1 fase
- 8 sem  → 2 fases (Base / Intensidad)
- 12 sem → 2–3 fases (Base / Fuerza / Skill)
- 26 sem → 3–4 fases (Activación / Fuerza / Intensidad / Peak)

## Reglas
- IDs EXACTOS del catálogo. Nunca inventes.
- Días `rest` no llevan exercises.
- Días `cardio` no llevan exercises (usa el campo `cardio`).
- Respeta tiempo disponible (~7–9 ej. para 60 min, ~5–6 para 30 min).
- Texto: explica brevemente la lógica del programa al usuario en español.
  NO listes ejercicios/series/IDs en el texto — eso lo verá en el preview.
- Si usuario pide cambios, vuelve a llamar create_program con versión nueva.
```

User context block is appended (same helper pattern as
`free-session-generator.ts`): age, weight, height, sex, level, goal, equipment,
location, availableTime.

## Limits

- `stopWhen: stepCountIs(20)` (vs 12 for free session — programs need more
  searches across categories).
- `maxOutputTokens: 6000`.
- Truncate to last 10 messages before `convertToModelMessages`.
- Frontend caps refinement turns at 8 per chat (soft warning).

## Files

### New
- `mcp-server/src/api/tools/search-exercises.ts` — extracted from
  `free-session-generator.ts`. Exports `searchExercisesTool`, `loadCatalog`,
  `exerciseCatalog` getter.
- `mcp-server/src/api/program-generator.ts` — `handleGenerateProgram`,
  `createProgramTool`, `SYSTEM_PROMPT_FALLBACK`.
- `src/components/program-ai/AIProgramChat.tsx` — main component.
- `src/components/program-ai/ProgramForm.tsx` — mini form.
- `src/components/program-ai/ProgramPreviewCard.tsx` — tool-result card.
- `src/components/program-ai/types.ts` — `AIProgramDraft`, `AIProgramExercise`,
  `AIProgramDay`, `AIProgramPhase`.
- `src/lib/ai-program-api.ts` — `PROGRAM_API_PATH = '/api/generate-program'`.

### Edited
- `src/pages/ProgramEditorPage.tsx` — wrap content in Tabs (`IA` | `Manual`);
  default IA when no `programId`; hide IA when editing.
- `src/hooks/useProgramEditor.ts` — add `applyAIDraft`.
- `src/locales/es/translation.json`, `src/locales/en/translation.json` —
  `programEditor.tabAI`, `programEditor.tabManual`, `aiProgram.*` keys
  (form labels, chips, errors, apply, banners, toasts).
- `mcp-server/src/api/index.ts` — `router.post("/generate-program", …)`.
- `mcp-server/src/api/free-session-generator.ts` — import
  `searchExercisesTool` from new shared module (small refactor; behavior
  unchanged).

## Testing

**Manual (golden path):**
1. `/programs/new` → IA tab is selected.
2. Fill mini form (Fuerza, Intermedio, 4 días, 8 semanas, parque, 45 min).
3. Submit → spinner → assistant text + preview card appear.
4. Click chip "Más fácil" → preview updates.
5. Click chip "Más core" → preview updates.
6. Click **Aplicar al editor** → toast → tab switches to Manual on step 1.
7. Walk steps 1 → 4 (no edits) → click **Guardar** → land on `/programs` →
   new program visible → open it → verify phases/days/exercises match.

**Manual (edges):**
- Force AI to return 0 valid IDs (e.g., by editing a fixture or breaking
  catalog) → preview shows warning + Reintentar chip.
- Network/auth error → red message + retry button (mirror free-session UI).
- Stop button mid-stream cancels the regeneration cleanly.
- Apply twice with manual edits in between → confirm dialog appears.
- Switch IA → Manual → IA after applying with `isDirty` → banner shows.

**Automated:**
- Backend unit test for `create_program` tool's ID validation: feed a
  draft with mixed valid/invalid IDs, assert dropped + `invalid_ids`
  populated.
- Frontend unit test for `applyAIDraft`: feed a fixture draft, assert
  resulting `state.info`, `state.phases.length`, `state.days[key].exercises`,
  `state.isDirty=true`, `state.step=1`.
- No Playwright e2e for the AI flow (non-deterministic + cost). Documented
  here so it's not added later by accident.

## Out of scope

- Saving generated programs as `is_official=true` or `is_featured=true` from
  the AI flow (admin-only, separate flow).
- Sharing AI drafts before applying.
- Persisting chat history across reloads (chat resets on tab leave/reload).
- A "compare versions" UX for refinement turns.
- Generating cardio-only or yoga-only programs with bespoke UI (allowed but
  no special preview treatment).

## Open risks

- **Tool output size:** a 26-week, 6-days/week program with 7 ex/day is
  ~140 exercises × 5 fields ≈ 4–5 KB JSON. Within `maxOutputTokens: 6000`
  but tight. Mitigation: prompt instructs AI to deduplicate exercises across
  weeks/phases (same `id` is fine, the editor renders them per-day).
- **Stale catalog IDs:** if the catalog file changes between when the AI
  searched and when the user clicks Apply much later, the frontend may not
  recognize an ID. The tool already validates server-side; we accept that
  the frontend just shows what the tool returned (with `name` baked in).
- **Refinement loops:** users could regenerate indefinitely. 8-turn soft
  warning + `rateLimit` middleware backstop.
