# Plan 003: Bound the friend-search user fetch (debounced server-side search instead of getFullList of every user)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**: from the repo root
> `/Users/guillermomarin/Documents/ejercicios/calistenia-app`, run:
> `git diff --stat 943f558..HEAD -- apps/mobile/src/app/friends.tsx`
> If `apps/mobile/src/app/friends.tsx` changed since this plan was written,
> compare the "Current state" excerpts below against the live code before
> proceeding. On any mismatch in the `loadAllUsers` / debounced-effect region
> (lines ~176–220), treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

The friend search in the native app currently calls
`pb.collection('users').getFullList(...)` on the first keystroke, pulling **every
user row** in the database into memory, then filters that array client-side with
`.includes()` on each (debounced) keystroke. With a small user base this is fine;
as the user base grows it degrades into a multi-megabyte fetch and per-keystroke
O(n) string scans — jank on low-end Android devices (the app's primary target,
per the project's Xiaomi/MIUI focus) and eventual memory pressure. This plan
replaces the "fetch-all-then-filter" approach with a **bounded, debounced,
server-side `getList` search** (max 20 rows per query), so memory and CPU stay
flat regardless of how many users exist. Behavior the user sees (type → results,
clear → empty, error → retry) stays identical.

## Current state

Files involved:

- `apps/mobile/src/app/friends.tsx` — the only source file this plan modifies.
  Friends screen: Siguiendo/Seguidores tabs + user search + invite. The unbounded
  fetch and client-side filter live at lines 176–220.
- `pb_migrations/1774000036_update_users_list_rule.js` — **read-only reference**.
  Proves the PocketBase `users` collection allows any authenticated user to
  `list`/`view` other users. This is what makes a server-side filtered query
  viable. Do NOT modify this file.
- `pb_migrations/1773243332_updated_users.js` — **read-only reference**. Proves
  `display_name` is a real text field on the users collection.

### The search field shape and the pure mapper (VERBATIM, `friends.tsx:32-50`)

```tsx
interface SearchResult {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

// ── Pure helper — no closures over component state ────────────────────────────

function mapPbItems(items: any[], excludeUserId: string): SearchResult[] {
  return items
    .filter((u: any) => u.id !== excludeUserId)
    .map((u: any) => ({
      id: u.id,
      displayName: u.display_name || u.name || u.username || '?',
      username: u.username || '',
      avatarUrl: getUserAvatarUrl(u, '100x100'),
    }))
}
```

This confirms the real PocketBase field names the search filter must use:
`display_name` (text) and `username` (the built-in auth field). `name` is only a
display fallback. **The filter you build in Step 2 must use `display_name` and
`username`, NOT `displayName`/`name`.**

### The refs and search state (VERBATIM, `friends.tsx:165-171`)

```tsx
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [retryTrigger, setRetryTrigger] = useState(0)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queryRef = useRef('')
```

### The unbounded fetch + client filter to REPLACE (VERBATIM, `friends.tsx:176-220`)

```tsx
  // ── Search (fetch all users, filter client-side — mirrors web approach) ──────
  const allUsersRef = useRef<SearchResult[]>([])
  const allUsersLoaded = useRef(false)

  const loadAllUsers = useCallback(async (): Promise<SearchResult[]> => {
    if (allUsersLoaded.current) return allUsersRef.current
    const res = await pb.collection('users').getFullList({ $autoCancel: false } as any)
    allUsersRef.current = mapPbItems(res, userId ?? '')
    allUsersLoaded.current = true
    return allUsersRef.current
  }, [userId])

  const query = search.trim()

  useEffect(() => {
    if (query.length < 1) {
      setSearchResults([])
      setSearchError(false)
      setSearching(false)
      return
    }
    queryRef.current = query
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(false)
      try {
        const allUsers = await loadAllUsers()
        if (queryRef.current !== query) return // stale
        const q = query.toLowerCase()
        const filtered = allUsers.filter(
          (u) =>
            u.displayName.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q),
        )
        setSearchResults(filtered)
      } catch {
        setSearchError(true)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(debounceRef.current)
  }, [query, userId, retryTrigger, loadAllUsers])
```

Notes the executor must preserve:
- The **stale-guard** (`if (queryRef.current !== query) return`) prevents an
  out-of-order debounced response from overwriting fresher results. Keep it.
- The **200ms debounce** via `debounceRef`/`setTimeout`. Keep it.
- The **error → `setSearchError(true)`** path drives the retry UI. Keep it.
- The effect's dependency array currently includes `loadAllUsers`. After Step 2
  `loadAllUsers` no longer exists, so it must be removed from the deps.
- `mapPbItems` is reused to shape rows. Keep using it.

### The PocketBase list rule that makes the server-side path viable (VERBATIM, `pb_migrations/1774000036_update_users_list_rule.js:1-17`)

```js
/// <reference path="../pb_data/types.d.ts" />
/**
 * Allow authenticated users to search/list other users.
 * Needed for the Friends search feature.
 * Only display_name and email are exposed (PB hides sensitive auth fields by default).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")
  collection.listRule = "id = @request.auth.id"
  collection.viewRule = "id = @request.auth.id"
  app.save(collection)
})
```

The forward `listRule` is `@request.auth.id != ""` — **any authenticated user can
list/filter all users**. A server-side filtered `getList` is therefore expected
to work. The fallback path (Step 2's STOP box) only applies if reality
contradicts this at runtime.

### The PocketBase SDK API you will call (verified against `pocketbase@0.26.9`)

Verified in
`node_modules/.pnpm/pocketbase@0.26.9/node_modules/pocketbase/dist/pocketbase.es.d.ts`:

- `pb.filter(raw: string, params?: { [key: string]: any }): string` (d.ts:1402) —
  builds a filter expression with `{:name}` placeholders. Its JSDoc (d.ts:1380-1392)
  states **single-quoted string values are auto-escaped**, so passing user input
  as a `{:q}` param is the injection-safe way to interpolate it. Do NOT build the
  filter by string concatenation.
- `pb.collection('users').getList<T>(page?, perPage?, options?): Promise<ListResult<T>>`
  (record service, d.ts:710). `ListResult` (interface at d.ts:33) has
  `items: Array<T>` (d.ts:38) plus `page`, `perPage`, `totalItems`, `totalPages`.
  You read `result.items`.
- On the options object, **both `filter` and `$autoCancel` are typed properties**:
  `filter?: string` lives on `ListOptions` (d.ts:320), and `$autoCancel?: boolean`
  lives on `SendOptions` (d.ts:311) which `RecordListOptions` (d.ts:329) extends.
  This means the new `getList(1, 20, { filter, $autoCancel })` call type-checks
  **without** any cast (the web equivalent at
  `apps/web/src/pages/FriendsPage.tsx:113` calls
  `getFullList({ $autoCancel: false })` with no cast for the same reason).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (from repo root) | `pnpm install` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0 (runs `tsc --noEmit`; clean on `943f558`) |
| Mobile tests | `cd apps/mobile && npm run test` | `vitest run`, all pass (baseline 3 files / 13 tests) |
| Mobile lint | `cd apps/mobile && npm run lint` | `expo lint`, exit 0 |
| Inspect users `display_name` field | `grep -rn '"name":' pb_migrations/1773243332_updated_users.js` | exactly one line: `"name": "display_name"` |
| Inspect users list rule | `cat pb_migrations/1774000036_update_users_list_rule.js` | shows `listRule = '@request.auth.id != ""'` |

All commands above are run from the repo root
`/Users/guillermomarin/Documents/ejercicios/calistenia-app` unless they begin
with `cd apps/mobile`.

> Note on the mobile test runner: `cd apps/mobile && npm run test` runs `vitest run`
> rooted at `apps/mobile`. It discovers ONLY tests under `apps/mobile`
> (e.g. `apps/mobile/src/lib/__tests__/*.test.ts`); it does NOT pick up
> `packages/core/lib/*.test.ts`. Since this plan's only optional new test lives
> in `apps/mobile/src/lib/__tests__/`, the mobile test command is the correct and
> sufficient runner. You do not need to run core tests for this plan.
> (`packages/core` has no `test` script of its own, so do not try to run one.)

## Suggested executor toolkit

- If available, invoke the `pocketbase-best-practices` skill before writing the
  filter in Step 2 — it covers safe filter interpolation and query patterns.
- If available, `vercel-react-native-skills` is relevant background for the
  debounced effect, but no change to memoization patterns is required here.

## Scope

**In scope** (the only files you may modify or create):
- `apps/mobile/src/app/friends.tsx` (modify)
- `apps/mobile/src/lib/user-search-filter.ts` (create — ONLY if you take the
  optional pure-helper path in the Test plan)
- `apps/mobile/src/lib/__tests__/user-search-filter.test.ts` (create — ONLY with
  the helper above)
- `advisor-plans/README.md` (status row update at the end)

**Out of scope** (do NOT touch, even though they look related):
- `apps/web/src/pages/FriendsPage.tsx` and anything under `apps/web/**` — the web
  app "mirrors" this code (it uses the same `getFullList({ $autoCancel: false })`
  at `FriendsPage.tsx:113`), but this plan changes mobile ONLY. Web is a separate
  concern.
- `packages/core/**` — `mapPbItems` lives in `friends.tsx`, not core; the core
  `pb` singleton and `getUserAvatarUrl` are imported as-is and not modified.
- Any `pb_migrations/**` file — the list rule is already correct; do not change
  the schema or rules.
- The `useFollows` hook and the Siguiendo/Seguidores list rendering — only the
  *search* code path changes.

## Git workflow

- Branch: `advisor/003-mobile-bound-friend-search` (create from `main`).
- Use **explicit file paths** in `git add` (e.g.
  `git add apps/mobile/src/app/friends.tsx`). NEVER `git add -A` or `git add .`.
- Commit per logical unit. Message style: Conventional Commits with a scope, e.g.
  `perf(mobile): bound friend search with debounced server-side getList`
  (matches the repo's `feat(mobile): ...` / `fix(cardio): ...` log style).
- Do NOT push, merge, rebase, or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Investigate — confirm field names and the users list rule

Before changing code, confirm the two assumptions the new filter depends on.

1. Confirm the searchable field names on the users collection:

   `grep -rn '"name":' pb_migrations/1773243332_updated_users.js`

   Expected output: exactly one line, `"name": "display_name"`. Combined with the
   `mapPbItems` excerpt above (which reads `u.display_name` and `u.username`),
   this confirms the filter must use `display_name` and `username`. (`username` is
   the built-in PocketBase auth field — it is not declared in this migration.)

2. Confirm the list rule permits searching other users:

   `cat pb_migrations/1774000036_update_users_list_rule.js`

   Expected: the forward migration sets `collection.listRule = '@request.auth.id != ""'`.

**STOP** if either is false: if `display_name` is not present as a field name, or
the live `listRule` is not `@request.auth.id != ""` (e.g. it restricts to
`id = @request.auth.id`). In that case the server-side filter cannot work as
written — stop and report which assumption failed.

**Verify**: `grep -c 'display_name' pb_migrations/1773243332_updated_users.js`
→ a number `>= 1` (the field exists).

### Step 2: Replace `loadAllUsers` + the client filter with a debounced bounded `getList`

In `apps/mobile/src/app/friends.tsx`, you will (a) delete the `loadAllUsers`
helper and its two refs, and (b) rewrite the body of the debounced `setTimeout`
to query the server with a bound. Do BOTH in this single step so the file is
internally consistent (no references to a deleted symbol) and typechecks at the
end of the step.

**2a — Delete the unbounded loader.** Remove these exact lines (currently
`friends.tsx:176-186`):

```tsx
  // ── Search (fetch all users, filter client-side — mirrors web approach) ──────
  const allUsersRef = useRef<SearchResult[]>([])
  const allUsersLoaded = useRef(false)

  const loadAllUsers = useCallback(async (): Promise<SearchResult[]> => {
    if (allUsersLoaded.current) return allUsersRef.current
    const res = await pb.collection('users').getFullList({ $autoCancel: false } as any)
    allUsersRef.current = mapPbItems(res, userId ?? '')
    allUsersLoaded.current = true
    return allUsersRef.current
  }, [userId])
```

Replace that whole block with a single comment line so the section stays
labelled:

```tsx
  // ── Search (debounced, bounded server-side query — máx 20 resultados) ────────
```

**2b — Rewrite the debounced fetch body.** Inside the existing `useEffect`, the
`setTimeout` callback currently calls `loadAllUsers()` and filters in JS. Replace
the body of the `try { ... }` block so it queries PocketBase directly with a
bound. The target shape (keep the surrounding `setSearching`/`setSearchError`/
`finally` and the stale-guard exactly as they are):

```tsx
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(false)
      try {
        const res = await pb.collection('users').getList(1, 20, {
          filter: pb.filter('display_name ~ {:q} || username ~ {:q}', { q: query }),
          $autoCancel: true,
        })
        if (queryRef.current !== query) return // stale
        setSearchResults(mapPbItems(res.items, userId ?? ''))
      } catch {
        setSearchError(true)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 200)
```

Then update the effect's dependency array (currently `friends.tsx:220`):

```tsx
  }, [query, userId, retryTrigger, loadAllUsers])
```

to remove the now-deleted `loadAllUsers`:

```tsx
  }, [query, userId, retryTrigger])
```

Rationale baked into the shape:
- `getList(1, 20, ...)` fetches at most 20 rows — the hard bound replacing
  `getFullList`.
- `pb.filter('... ~ {:q} ...', { q: query })` interpolates the user's text
  **safely** (single-quote auto-escaping per the SDK JSDoc), preventing
  filter-string injection. Do NOT build the filter by string concatenation.
- `~` is PocketBase's "contains" operator, matching the old `.includes()`
  semantics on both `display_name` and `username`.
- `res.items` is the row array; `mapPbItems` shapes/excludes self exactly as
  before.
- `$autoCancel: true` lets PocketBase cancel the in-flight request when a newer
  query supersedes it. Both `filter` and `$autoCancel` are **typed** options on
  the record `getList` options object (see "The PocketBase SDK API" section), so
  **no `as any` cast is needed** — write the object as shown. (If for some reason
  `tsc` complains about the options object in your environment, a trailing
  `as any` on the object is a harmless fallback, but it should not be necessary.)

**Verify**:
1. `grep -n 'getFullList\|loadAllUsers\|allUsersRef\|allUsersLoaded' apps/mobile/src/app/friends.tsx`
   → **no output** (exit code 1). All four old symbols are gone.
2. `grep -n 'getList(1, 20' apps/mobile/src/app/friends.tsx`
   → exactly one matching line (the bounded query exists).
3. `grep -n 'pb.filter(' apps/mobile/src/app/friends.tsx`
   → at least one matching line (the safe interpolation is used). NOTE: if you
   take the optional pure-helper path in the Test plan, the literal filter
   *string* `'display_name ~ {:q} || username ~ {:q}'` moves into
   `user-search-filter.ts`, but `pb.filter(` itself still appears in
   `friends.tsx` — so this check stays valid either way.
4. `cd apps/mobile && npm run typecheck` → exit 0, no errors.

> **STOP — fallback path (only if a runtime smoke test in the Test plan reveals
> the server-side query returns 403 or always-empty results despite matching
> users existing).** If, when you manually smoke-test (see Test plan), a search
> that should match a known user returns an error or empty while the OLD code
> would have found them, the live PocketBase rules differ from the migration.
> Do NOT silently ship a broken search. Stop and report. The documented fallback
> the operator may then approve is a **bounded** `getFullList` that keeps the
> client filter but caps the fetch:
> ```tsx
> const res = await pb.collection('users').getFullList({
>   batch: 200,
>   $autoCancel: false,
> })
> // ...then mapPbItems + the original client-side .includes() filter, capped.
> ```
> This is a fallback, not the default — only apply it if instructed after
> reporting.

### Step 3: Confirm no dead code remains and the file is clean

After Step 2, the React hook imports on `friends.tsx:5`
(`useState, useEffect, useRef, useMemo, useCallback`) are ALL still used
elsewhere in the component, so **do not remove any import**:
- `useRef` → still used by `debounceRef` (`friends.tsx:170`) and `queryRef`
  (`friends.tsx:171`).
- `useCallback` → still used by `renderFollowUser` (`friends.tsx:253`) and
  `renderSearchResult` (`friends.tsx:272`).
- `useMemo` → still used by `followerIds` (`friends.tsx:174`) and
  `sortedSearchResults` (`friends.tsx:223`).
- `useState`/`useEffect` → obviously still used.

Confirm nothing else referenced the deleted refs.

**Verify**:
1. `cd apps/mobile && npm run lint` → exit 0 (no "unused variable" / unused-import
   errors introduced).
2. `cd apps/mobile && npm run typecheck` → exit 0.

### Step 4: Final typecheck + test gate

**Verify**:
1. `cd apps/mobile && npm run typecheck` → exit 0.
2. `cd apps/mobile && npm run test` → `vitest run` passes. The baseline on a clean
   tree is **3 test files / 13 tests**. If you added the optional helper test in
   the Test plan it is **4 files / 13+N tests**, all passing. (If you ever see a
   stray extra test file from another agent's scratch work, ignore it — it is not
   part of this change.)
3. From repo root: `git diff --stat 943f558..HEAD -- apps/web` → **no output**
   (web untouched).

## Test plan

There is **no React-Native render-test infrastructure** in this repo (no
`@testing-library/react-native`, no `jest-expo`, no DOM/render environment).
Tests run in the **default node environment**. Every existing test is a pure-logic
unit test that imports a function and asserts its return value — see the exemplar
`apps/mobile/src/lib/__tests__/live-activity-state.test.ts`
(`import { describe, it, expect } from 'vitest'`, then `expect(fn(input)).toEqual(...)`).
**Do NOT attempt to render `FriendsScreen` or any component/hook in a test** —
there is no environment for it; that is a redesign/STOP condition.

The change in Step 2 is mostly I/O wiring (a `getList` call), which is not
unit-testable without a network/render harness. Automated coverage is therefore
**only feasible if you extract the filter construction into a pure helper**:

**Optional pure-helper path (preferred if low-cost):**
1. Create `apps/mobile/src/lib/user-search-filter.ts` exporting a pure function,
   e.g.:
   ```ts
   /** Construye el filtro PocketBase para buscar usuarios por nombre o username. */
   export function buildUserSearchFilter(q: string): {
     raw: string
     params: { q: string }
   } {
     return { raw: 'display_name ~ {:q} || username ~ {:q}', params: { q } }
   }
   ```
   Then in `friends.tsx`, import it and build the filter via
   `const { raw, params } = buildUserSearchFilter(query)` and pass
   `pb.filter(raw, params)` to the `getList` options. (`pb.filter(` still appears
   in `friends.tsx`, so the Step 2 Verify #3 check still holds.)
2. Create `apps/mobile/src/lib/__tests__/user-search-filter.test.ts`, modeled
   structurally on `live-activity-state.test.ts`. Cover:
   - happy path: a non-empty query returns the expected `raw` template and
     `params.q === query`.
   - the raw template references BOTH `display_name` and `username` (the
     regression this plan guards against — wrong field names silently break
     search). A simple assertion is
     `expect(buildUserSearchFilter('x').raw).toContain('display_name')` and the
     same for `'username'`.
   - an empty string query: `params.q === ''` (the component already short-circuits
     empty queries before calling, but the helper must not throw).
3. Run `cd apps/mobile && npm run test` → all pass, including the new file.

If you take this path, the helper and its test are in scope (see Scope). If you
judge the extraction not worth it, that is acceptable — state so in your report
and rely on the manual smoke test below; do NOT add a test that requires rendering.

**Manual smoke-test checklist (required regardless of the helper decision).**
Report results for each. (You set up the run; you are NOT required to drive the
UI via automated taps.)
- [ ] Open the Amigos screen, type a query that matches a known user's
  `display_name` or `username` → that user appears in results.
- [ ] Clear the search input (empty query) → results clear and the Siguiendo/
  Seguidores tabs reappear (no crash).
- [ ] Type a query that matches nobody → the `Sin resultados para "…"` empty state
  shows (no crash, no spinner stuck on).
- [ ] Type fast (multiple keystrokes) → only one final result set shows; no
  flicker of stale results (stale-guard working).
- [ ] If any search errors or returns empty for a user that clearly exists →
  this is the Step 2 fallback STOP condition; stop and report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n 'getFullList\|loadAllUsers\|allUsersRef\|allUsersLoaded' apps/mobile/src/app/friends.tsx` returns no output (exit 1).
- [ ] `grep -n 'getList(1, 20' apps/mobile/src/app/friends.tsx` returns exactly one line.
- [ ] `grep -n 'pb.filter(' apps/mobile/src/app/friends.tsx` returns at least one line (the safe interpolation is used).
- [ ] `cd apps/mobile && npm run typecheck` exits 0.
- [ ] `cd apps/mobile && npm run lint` exits 0.
- [ ] `cd apps/mobile && npm run test` exits 0 (all existing tests pass; plus N new tests if the optional helper was added).
- [ ] `git diff --stat 943f558..HEAD -- apps/web packages/core pb_migrations` returns no output (no out-of-scope files modified).
- [ ] `git status --porcelain` shows changes ONLY under `apps/mobile/` and (if updated) `advisor-plans/README.md`.
- [ ] `advisor-plans/README.md` status row for plan 003 updated (add a `003` row if one does not yet exist — the index currently lists only plan 001).

## STOP conditions

Stop and report (do not improvise) if:

- The drift check shows `apps/mobile/src/app/friends.tsx` changed since `943f558`
  and the `loadAllUsers` / debounced-effect region no longer matches the
  "Current state" excerpts.
- Step 1 reveals `display_name` is not a real users field, OR the live `listRule`
  is not `@request.auth.id != ""` (it restricts listing to self). The server-side
  filter cannot work — report which assumption failed.
- The manual smoke test shows the new `getList` query returns 403 or empty for a
  user the OLD code would have found (live PB rules differ from the migration).
  Report; the operator may approve the bounded-`getFullList` fallback in Step 2's
  STOP box.
- A verification command fails twice after a reasonable fix attempt.
- The fix appears to require editing any out-of-scope file (web, core, migrations).

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Pagination**: the search is hard-capped at 20 results (`getList(1, 20, …)`).
  If product wants "load more" search results, add page handling here — there is
  intentionally no infinite scroll on search today.
- **Field drift**: the filter hardcodes `display_name` and `username`. If the
  users collection renames either field (a `pb_migrations` change), the filter
  must be updated in lockstep. The optional `buildUserSearchFilter` test guards
  the *template shape* but cannot detect a backend rename — a reviewer should
  flag any migration that touches those field names.
- **Privacy/rules coupling**: this feature depends on
  `pb_migrations/1774000036_update_users_list_rule.js` keeping `listRule` open to
  authenticated users. If that rule is ever tightened for privacy, friend search
  breaks; revisit this query (e.g. a dedicated search endpoint) at that time.
- **Web parity**: `apps/web/src/pages/FriendsPage.tsx:113` still uses the old
  fetch-all approach (`getFullList({ $autoCancel: false })`, out of scope here).
  A follow-up plan should apply the same bounded server-side search to web for
  consistency; explicitly deferred.
- **PR review focus**: confirm `pb.filter()` is used (not string concatenation),
  that the stale-guard and 200ms debounce survived the rewrite, and that no React
  import was removed (the hooks remain in use elsewhere in the component).
