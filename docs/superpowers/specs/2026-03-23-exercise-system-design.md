# Exercise System Redesign: Private + Promotion Model

**Date:** 2026-03-23
**Status:** Approved
**Scope:** exercises_catalog schema, MCP tools, dedup strategy, promotion flow

## Problem

The app has a single shared `exercises_catalog` with no ownership model. Only admins can create exercises via MCP. Users (friends) want to add their own exercises, but there's no way to do so without risking duplicates and catalog pollution.

## Decision

Single collection (`exercises_catalog`) with visibility fields and role-based API rules. Users create private exercises. Admins promote good ones to official status. Duplicate prevention via slug check + fuzzy name search with optional variant tagging.

## Schema Changes

### New Fields on `exercises_catalog`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `created_by` | relation → users | no | null | null = official/system exercise |
| `status` | select | yes | `"official"` | `official`, `private`, `promoted` |
| `variant_of` | relation → exercises_catalog | no | null | Parent exercise this is a variant of |
| `promoted_from` | relation → exercises_catalog | no | null | Audit trail: points to original private exercise |

### Updated API Rules

| Rule | Value |
|------|-------|
| **List/View** | `@request.auth.id != "" && (status = "official" \|\| status = "promoted" \|\| created_by = @request.auth.id)` |
| **Create** | `@request.auth.id != ""` |
| **Update** | `created_by = @request.auth.id` |
| **Delete** | `created_by = @request.auth.id && status = "private"` |

Admin/MCP bypasses these rules via direct PocketBase SDK access.

### New Index

`idx_catalog_status_user` on `status`, `created_by`

## Deduplication Strategy

When a user creates an exercise:

1. **Generate slug** from name (lowercase, strip accents, hyphenate).
2. **Exact slug match** across all statuses:
   - Found in official/promoted → block, show "This exercise already exists in the catalog."
   - Found in user's own private → block, show "You already have this exercise."
3. **Fuzzy name match** (`name ~` operator) against official + promoted exercises:
   - Matches found → show suggestions: "Did you mean one of these?"
   - User picks existing → done.
   - User proceeds anyway → `variant_of` set to the selected official exercise.
   - User says "it's different" → created with no `variant_of`.

No ML or Levenshtein. PocketBase regex match on name + individual word matching. Misses are caught during admin promotion review.

**Fuzzy search details:**
- Split input name into words, search each word: `name ~ "muscle" || name ~ "up"`
- Case insensitive via PocketBase `~` operator
- Limit results to top 5 matches to avoid overwhelming the UI
- Does NOT match across word boundaries (e.g., "pullup" won't match "pull up") — acceptable tradeoff, caught during promotion review

## Promotion Flow

### MCP tool: `cal_promote_exercise`

**Input:** `exercise_id` + optional overrides (name, description, muscles, category, youtube, etc.)

**Steps:**
1. Fetch exercise, verify `status = "private"`.
2. Apply admin overrides (clean up name, description, media).
3. Update: `status → "promoted"`, `created_by` stays (credit to creator).

**No data migration.** The exercise ID stays the same. All `program_exercises`, `logged_sets`, and `variant_of` references continue working.

**Edge cases during promotion:**
- Admin can override `name`, `description`, `muscles`, `category`, `youtube`, `slug`, and can clear or change `variant_of`.
- If a promoted exercise has `variant_of` set, admin decides whether to keep or clear it.
- `promoted_from` is NOT used on the promoted record itself (it stays the same record). `promoted_from` is only set if admin creates a new official copy instead of promoting in-place (not the default flow).
- Promoted exercises cannot be deleted by the original creator (enforced by API rule `status = "private"` on delete).

### MCP tool: `cal_demote_exercise`

Reverts a promoted exercise back to `status = "private"`. Only usable by admin via MCP.

## MCP Tool Changes

### Modified Tools

| Tool | Change |
|------|--------|
| `cal_create_exercise` | Add `created_by` param (optional). Add `variant_of` param. Auto-set `status = "private"` when `created_by` is provided, `"official"` when null. Run fuzzy search before creation. |
| `cal_list_catalog` | Add `status` filter (official, private, promoted, all). Add `created_by` filter. Default shows official + promoted. |
| `cal_import_wger_exercise` | No change. Defaults to `status = "official"`. |

### New Tools

| Tool | Purpose |
|------|---------|
| `cal_check_exercise_duplicate` | Takes a name, returns exact slug matches + fuzzy name matches from official/promoted catalog. Used before creation. |
| `cal_promote_exercise` | Admin-only. Sets `status = "promoted"` with optional field overrides. |
| `cal_demote_exercise` | Admin-only. Reverts promoted exercise to `status = "private"`. |

### Unchanged Tools

- `cal_add_program_exercise` — works with any exercise ID regardless of status.
- `cal_update_program_exercise` / `cal_remove_program_exercise` — no change.
- `cal_build_program` — no change.
- `cal_log_set` — exercise_id unchanged through promotion.
- Media tools — no change.

## Frontend Impact

### ExerciseCatalogPicker
- No filter changes — API rules handle visibility automatically.
- Add visual badges: `Official`, `My Exercise`, `Community` (promoted).

### Future "Add Exercise" UI (out of scope for this spec)
- Form with name, category, muscles, equipment, defaults.
- Calls `cal_check_exercise_duplicate` on submit.
- Shows suggestion cards if matches found.
- Calls `cal_create_exercise` with `created_by` = current user.

### No changes to
- Program editor (works with exercise IDs regardless of status).
- Workout logging (exercise_id unchanged).
- Progression tracking (independent system).

## Migration Plan

Single PocketBase migration:

1. Add 4 new fields (`created_by`, `status`, `variant_of`, `promoted_from`).
2. Backfill existing records: `status = "official"`, `created_by = null`.
3. Update API rules on `exercises_catalog`.
4. Add index `idx_catalog_status_user` on `status`, `created_by`.

No data loss. No broken references. Fully backwards compatible.

## Edge Cases

- **User deletes private exercise that others reference as `variant_of`:** PocketBase relation with no cascade — the `variant_of` field on referencing exercises becomes a dangling reference. Acceptable: the variant tag is informational only, not functional. Frontend treats null/missing `variant_of` gracefully.
- **Same slug across different users' private exercises:** Allowed. Slug uniqueness is only enforced per-user for private exercises. On promotion, admin can change the slug if needed.
- **Promoting a variant:** Admin can promote a variant exercise. They choose whether to keep or clear `variant_of` during promotion.
