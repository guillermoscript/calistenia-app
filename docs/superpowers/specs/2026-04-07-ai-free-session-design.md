# AI Free Session Generator — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Overview

Add an AI-powered tab to the Free Session page where users fill a pre-populated form with their profile data (age, weight, equipment, time, etc.), the AI generates a custom workout session via streaming, and the user can edit it through chat before starting the session.

## User Flow

1. User opens Free Session page → sees two tabs: **Manual** (existing catalog) and **IA**
2. Tab IA shows a **pre-filled form** with user data (age, weight, height, level, goal, equipment, location, available time)
3. User adjusts fields and taps **"Generar sesión"**
4. Form data becomes the first chat message → AI streams a response with a structured exercise list
5. Response renders as an **editable session preview** (reorder, remove, add exercises)
6. User can type in chat to request changes ("más core", "quita dominadas") → AI adjusts
7. **"Empezar sesión"** maps AI exercise output (`{ id, sets, reps, rest }`) into a `Workout` object (with `exercises: Exercise[]`, `day`, `phase`) using an adapter function, then calls `startSession()` with `source='free'`

> **Note:** Sessions use `source='free'` same as manual free sessions. Analytics differentiation (if needed later) can use a metadata flag.

## Architecture

### Backend — Streaming Endpoint

**Endpoint:** `POST /api/generate-free-session`

Follows existing pattern: `requireAuth` → `rateLimit` → handler.

```typescript
// Request
{
  messages: [{ role: 'user' | 'assistant', content: string }],
  userContext: { age, weight, height, sex, level, goal, equipment, location, availableTime }
}

// Response: AI SDK data stream (SSE)
// Content-Type: text/event-stream
```

**Handler logic:**
1. Build system prompt with user context data + lightweight markdown exercise overview
2. Register `search_exercises` tool for the AI to query PocketBase `exercises_catalog`
3. Call `streamText()` with resolved model, `maxOutputTokens: 2000`, `stopWhen: isStepCount(5)` (bounds tool loops)
4. Return `result.pipeUIMessageStreamToResponse(res)` (Express pattern for `useChat` compatibility)

**Model resolution:** Uses existing `resolveModel(tier)` — model choice is trivial to change.

**Conversation limits:** Messages array truncated to last 10 exchanges to bound token cost on edits.

**Prompt management:** Langfuse via `getPromptWithMeta('free-session-generator')` with hardcoded fallback.

### Exercise Catalog — Tool-Based Approach

Instead of injecting the full exercise catalog JSON into the prompt (token-expensive), the AI uses tools:

- **`search_exercises` tool** — Queries `exercises_catalog` collection in PocketBase by criteria (muscle group, equipment, difficulty, category). Returns: ID, name, muscles, equipment, difficulty.
- **Markdown summary** in system prompt — lightweight overview of available exercises so the AI knows what exists without token overhead.
- AI makes multiple `search_exercises` calls as needed (e.g., "3 pull exercises for bar", "2 core exercises no equipment").

Benefits:
- Minimal tokens in prompt
- Modular — same tool reusable for future features
- Always-fresh data from PocketBase
- `streamText` supports tools natively with `stopWhen: isStepCount(N)`

### AI Output Format

The AI responds in markdown with an embedded JSON block:

```markdown
He preparado una rutina de 30 minutos enfocada en...

​```json
{ "exercises": [{ "id": "pull_up", "sets": 3, "reps": "8-10", "rest": 90 }, ...] }
​```
```

Frontend parses the JSON block to render the session preview.

### Frontend — UI Components

```
FreeSessionPage.tsx
├── Tabs: "Manual" | "IA"
├── Tab Manual → existing catalog (unchanged)
└── Tab IA → <AISessionTab>
    ├── Initial state: <SessionForm> (pre-filled form)
    ├── Generating/chat state:
    │   ├── <Conversation> + <Message> (from ai-elements/)
    │   ├── <SessionPreview> (editable exercise list)
    │   └── <PromptInput> (for chat edits)
    └── "Empezar sesión" button
```

**`<SessionForm>`** — Pre-filled with user profile data:
- Age, weight, height (from `nutrition_goals` or profile)
- Fitness level (from profile)
- Goal: strength, endurance, mobility, mixed (per-session choice)
- Equipment: checkboxes (bar, parallettes, rings, bands, none)
- Location: home, park, gym
- Available time: slider 15-60 min

**`<AISessionTab>`** — Uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport` pointing to the endpoint. Manages input state via `useState` (not built-in). Submitting the form builds the first user message via `sendMessage()`. Uses ai-elements for rendering.

**`<SessionPreview>`** — Parses exercise JSON from AI response. Drag-to-reorder, remove per exercise, add from catalog. "Empezar sesión" calls `startSession()` from `ActiveSessionContext`.

**`<Suggestion>` pills** — Quick edits: "Más core", "Más fácil", "Menos tiempo", "Agregar calentamiento".

### Data Sources for User Context

- `age`, `weight`, `height`, `sex` → `nutrition_goals` collection
- `level` → user profile
- `goal`, `equipment`, `location`, `availableTime` → form fields (user chooses per session)

## Error Handling

- **Stream failure mid-response:** `useChat` handles error state → "Error generando sesión, intenta de nuevo" + retry button
- **Endpoint timeout:** 60s
- **Rate limit exceeded:** clear message to user (429)
- **`search_exercises` returns no results:** AI adjusts criteria or informs user
- **Exercise ID not in frontend catalog:** silently discarded
- **Missing profile data:** form shows empty fields, user fills them. Required fields: available time and equipment.
- **Zero valid exercises:** error message + retry option

## Testing

- **Backend:** endpoint auth/rate-limit, `search_exercises` tool filters, SSE response format
- **Frontend e2e (Playwright):** full flow — form → generate → preview → chat edit → start session
- **Mocked streaming** for deterministic tests
