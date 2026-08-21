# Common audit packet (read fully before starting)

Repo: /Users/guillermomarin/Documents/ejercicios/calistenia-app  (pnpm monorepo: apps/web = React 19 + Vite SPA (NOT Next.js), apps/mobile = Expo/React Native + expo-router + NativeWind, packages/core = shared hooks/lib/types/data used by BOTH apps, pb_hooks = PocketBase JS hooks (goja JSVM), mcp-server = Node/TS AI API + MCP server).

## Objective
READ-ONLY code-quality audit. Find code smells and violations of best practices in your assigned scope. Do NOT edit any file. Do NOT run git write commands. Do NOT run the app.

## Reference guidelines (read the SKILL.md + the rules/ files relevant to your scope BEFORE reviewing)
- .agents/skills/vercel-react-best-practices/  (SKILL.md + rules/*.md)  — applies to web AND mobile React code (ignore Next.js-only rules like server-*, RSC, next/dynamic; map bundle-dynamic-imports to React.lazy / vite dynamic import)
- .agents/skills/vercel-composition-patterns/   (SKILL.md + rules/*.md)  — component API design: boolean prop proliferation, compound components, children over render props, explicit variants, context interfaces, lifting state, no forwardRef in React 19
- .agents/skills/vercel-react-native-skills/     (SKILL.md + rules/*.md)  — mobile only: list performance, animations, Pressable, expo-image, safe areas, text-in-Text, no falsy &&, state minimization, etc.
- General engineering principles (apply everywhere, including pb_hooks / mcp-server / core):
  * Separation of concerns: business logic (calculations, PocketBase queries, data shaping, validation) should live in packages/core (hooks/lib), UI components should be presentational. Flag business logic embedded in JSX/pages/screens, and flag data fetching done ad-hoc in components when a core hook exists or should exist.
  * DRY: duplicated logic between apps/web and apps/mobile (should be in packages/core), copy-pasted helpers, repeated inline fetch/query code, duplicated constants/labels/formatting.
  * SOLID: god components / god hooks (SRP), files >500 lines doing many things, hooks that both fetch AND mutate AND format AND navigate, tight coupling to PocketBase SDK inside UI, hard-coded switch chains that should be polymorphic/config-driven (OCP), interfaces that force consumers to pass unused props (ISP), UI importing concrete infra instead of abstractions (DIP).
  * KISS: over-abstraction, needless indirection, dead code, unused exports, commented-out code, over-engineered state, prop drilling >3 levels, useEffect chains that could be derived state.
  * Spaghetti: cross-imports between features, circular deps, components reaching into contexts they shouldn't, mixed responsibilities, magic numbers/strings, inconsistent naming, silent catch(){} blocks, `any` abuse, non-null assertions.
  * React-specific: useEffect for derived state, missing/incorrect deps, inline component definitions, unstable callbacks in lists, non-functional setState, state duplication from props, uncleaned subscriptions/timers, unmemoized heavy computations in render, giant useState clusters that should be a reducer/machine, missing key or index keys.

## Method
1. Read the referenced skill rules first (skim all rule filenames; open the ones relevant).
2. `wc -l` your scope to prioritize; read the biggest / most central files fully; skim the rest with grep for patterns (useEffect, useState, pb.collection, fetch(, any, !., catch, TODO, FIXME, eslint-disable, forwardRef, Math.random, setTimeout, addEventListener, FlatList/ScrollView, .map( in JSX, inline styles/objects).
3. Every finding MUST cite file:line (or line range) and quote 1–3 lines of evidence. No vague findings. Verify by actually reading the code — do not guess from filenames.
4. Classify each finding: severity (High / Medium / Low), category (Separation-of-concerns | DRY | SOLID-SRP/OCP/ISP/DIP | KISS | Spaghetti | React-perf (cite the vercel rule id e.g. rerender-derived-state-no-effect) | RN-perf (cite rule id) | Composition (cite rule id) | Correctness-smell), and a 1-line suggested fix direction (no code needed).
5. Prefer fewer, well-evidenced findings over many speculative ones. Aim for 10–30 solid findings for your scope. Note things done WELL too (2–5 bullets) so the final report is fair.
6. Also give the scope a health grade A–F with 1–2 sentence rationale, and list the top 3 refactors that would most improve it.

## Output
Write your full report (markdown) to: /Users/guillermomarin/.claude/jobs/cf5bf9dd/tmp/audit/<YOUR-AGENT-NAME>.md
Structure: `# <scope>` → `## Grade` → `## Top 3 refactors` → `## Findings` (table or list, grouped by severity, each with file:line + evidence + category + fix) → `## Done well` → `## Files reviewed` (list, and mark which you read fully vs skimmed).
Then RETURN to the caller ONLY a compact summary (max ~25 lines): grade, counts by severity, top 5–8 findings with file:line one-liners, and the report path. Do not paste the whole report back.

## Stop conditions
- If a scope path does not exist, note it and continue with the rest.
- Do not go outside your scope except to briefly confirm whether a helper already exists in packages/core (that's encouraged for DRY findings).
