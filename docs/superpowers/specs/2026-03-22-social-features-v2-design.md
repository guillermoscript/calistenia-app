# Social Features V2 — Design Spec

## Overview

Enhance the social experience so users can see what programs/routines their friends follow, comment on sessions, receive notifications, and react with more emoji options. Implemented in 3 incremental phases.

## Phases

1. **Reacciones ampliadas + Programa/Rutina visible**
2. **Comentarios con threads**
3. **Notificaciones (in-app + push)**

---

## Phase 1: Expanded Reactions + Visible Program/Routine

### 1.1 Expanded Reactions

**Available emojis:** 🔥 💪 👏 🎯 🏆

**DB changes:** The `feed_reactions` collection already has an `emoji` (text) field. Currently hardcoded to 🔥. Migration steps:
1. Drop the existing unique index `idx_reaction_unique` on `(session_id, reactor)`
2. Create new unique index on `(session_id, reactor, emoji)` — a user can place multiple distinct emojis on the same session
3. Set `updateRule: null` — reactions are now toggled via create/delete only (no updates needed)

**UI changes (FeedCard):**
- Replace the single 🔥 button with an inline emoji picker (horizontal bar with the 5 emojis)
- Show grouped counters below each session (e.g., 🔥3 💪2)
- Tap an emoji = toggle (same behavior as now, per emoji)

**Hook changes (`useReactions`):**
- State shape changes from `Record<string, { count, hasReacted }>` to `Record<string, Record<emoji, { count, hasReacted }>>`
- `toggleReaction(sessionId, emoji)` — accept emoji parameter instead of hardcoding
- `getReactions(sessionIds)` — return grouped by emoji with counts per session
- `hasReacted(sessionId, emoji)` — check per emoji
- `FeedCard` must be updated to render per-emoji grouped counters

### 1.2 Visible Program/Routine

#### Public Profile (`UserProfilePage`)

New section "Programa actual":
- Shows: program name, current phase, assigned routine name
- "Ver rutina" button opens `RoutineViewPage` with full detail
- If no active program: "Sin programa activo"

**Privacy:** Program/routine data is visible to all authenticated users. API rules for `user_programs`, `program_phases`, and `program_exercises` must allow read access for authenticated users. Verify existing rules and add a migration to relax read rules if needed. Opt-out of sharing program data is out of scope for V2.

#### Activity Feed (`ActivityFeedPage`)

- Each FeedCard adds the program name as subtitle (e.g., "Programa Fuerza — Día Push")
- Tap on program name → navigates to `RoutineViewPage` (read-only)

#### New Page: `RoutineViewPage`

- Displays a user's routine in full detail: exercises, sets, reps, rest periods
- Read-only — no editing or copying
- Accessible from public profile and from feed cards
- Route: `/u/:userId/routine`
- Shows exercise names, target sets/reps, rest times, notes

---

## Phase 2: Comments with Threads

### 2.1 New Collection: `comments`

| Field | Type | Description |
|-------|------|-------------|
| `id` | auto | PK |
| `session_id` | text | Feed session being commented on |
| `author` | relation (users) | Comment author |
| `text` | text (max 500 chars) | Comment content |
| `parent_id` | relation (comments), nullable, cascadeDelete: true | Parent comment if this is a reply |
| `created` | auto | Timestamp |

**Note on `session_id`:** Uses `text` type (not relation) to match the existing pattern in `feed_reactions`. Orphan cleanup for deleted sessions is out of scope for V2.

**Indexes:**
- `(session_id, created)` — load comments in order

**API rules:**
- Create: `@request.auth.id != "" && @request.body.author = @request.auth.id` — authenticated users can only create comments as themselves
- Delete: `author = @request.auth.id` — only the comment author can delete
- Read: `@request.auth.id != ""` — any authenticated user
- Update: `null` — no editing comments

**Cascade delete:** When a parent comment is deleted, all child replies are automatically deleted via `cascadeDelete: true` on the `parent_id` relation.

**Rate limiting:** Client-side rate limit of max 1 comment per 5 seconds to prevent spam. Server-side rate limiting deferred to a future iteration.

### 2.2 UI

**FeedCard addition:**
- Comment icon 💬 with counter next to reactions
- Tap → opens `CommentsSheet`

**CommentsSheet (bottom sheet or page):**
- Comments listed chronologically (oldest first)
- Each comment: avatar, display name, text, relative time ("hace 2h")
- Replies (threads): indented below parent comment with visual connector line
- "Responder" button on each comment → input prefills with parent context
- Fixed text input at bottom with send button
- Maximum 1 level of nesting — replies to replies flatten to the same thread level

### 2.3 Hook: `useComments`

- `getComments(sessionId)` — load comments with their replies, ordered
- `addComment(sessionId, text, parentId?)` — create comment or reply (enforces 5s rate limit)
- `deleteComment(commentId)` — delete own comment
- Cache TTL: 30 seconds per session

---

## Phase 3: Notifications (In-App + Push)

### 3.1 New Collection: `notifications`

| Field | Type | Description |
|-------|------|-------------|
| `id` | auto | PK |
| `user` | relation (users) | Notification recipient |
| `type` | text | One of: `follow`, `reaction`, `comment`, `comment_reply`, `challenge_invite` |
| `actor` | relation (users) | Who triggered the action |
| `reference_id` | text | ID of related resource (session, comment, challenge) |
| `reference_type` | text | Resource type: `session`, `comment`, `challenge` |
| `read` | bool (default false) | Whether notification has been read |
| `created` | auto | Timestamp |

**Indexes:**
- `(user, created)` — fast loading
- `(user, read)` — count unread

**API rules:**
- Read: `user = @request.auth.id` — only the notification owner
- Update: `user = @request.auth.id` — only the notification owner (to mark as read)
- Create: `null` — **no client-side creation** (see below)
- Delete: `user = @request.auth.id` — users can clear their own notifications

### 3.2 Notification Creation — Server-Side Hooks

Notifications are created via **PocketBase JS hooks** (`onRecordAfterCreateSuccess`) on the source collections, not from the client. This prevents spoofing/impersonation.

**Hooks:**
- `follows.onRecordAfterCreateSuccess` → create `follow` notification for the followed user
- `feed_reactions.onRecordAfterCreateSuccess` → create `reaction` notification for the session owner
- `comments.onRecordAfterCreateSuccess` → create `comment` notification for session owner, or `comment_reply` for parent comment author
- `challenge_participants.onRecordAfterCreateSuccess` → create `challenge_invite` notification

**Rules:**
- Self-notifications are suppressed (don't notify yourself)
- Each hook also triggers a Web Push via the existing `push_subscriptions` + `push-sender.ts` infrastructure

### 3.3 In-App UI

**Navigation badge:**
- Bell icon 🔔 in the navigation bar with red badge showing unread count
- Tap → opens `NotificationsPage`

**NotificationsPage:**
- Chronological list of notifications
- Each item: actor avatar, message text, relative time, highlighted background if unread
- Tap notification → mark as read + navigate to resource (profile, session, challenge)
- "Marcar todas como leídas" button at top
- Opening NotificationsPage marks all visible notifications as read (single batch call via `markAllAsRead`)

### 3.4 Push Notifications

**Delivery mechanism:**
- **In-app (app open):** PocketBase realtime subscriptions on `notifications` collection for live badge updates
- **Background/closed (true push):** Web Push API via the existing `push_subscriptions` collection and `push-sender.ts`. Server-side hooks (see 3.2) trigger Web Push when creating a notification.
- Push permission is requested on first app visit with an explanation of why

### 3.5 Hook: `useNotifications`

- `getNotifications(limit?)` — load paginated notifications
- `getUnreadCount()` — count for the badge
- `markAsRead(notificationId)` — mark individual
- `markAllAsRead()` — mark all as read (batch)
- `subscribeToNew(callback)` — realtime via PocketBase for live badge updates when app is open

---

## Data Flow Summary

```
User Action → Primary Hook (create record)
                    ↓
         PocketBase Server Hook (onRecordAfterCreateSuccess)
                    ↓
         Create notification record + Trigger Web Push
                    ↓
         ┌─────────────────────────────────┐
         │ App open: PocketBase Realtime   │ → Badge update
         │ App closed: Web Push API        │ → System notification
         └─────────────────────────────────┘
```

## Migration Order

1. Update `feed_reactions`: drop old unique index, create new `(session_id, reactor, emoji)` index, set `updateRule: null`
2. Verify/update read rules on `user_programs`, `program_phases`, `program_exercises` for authenticated access
3. Create `comments` collection with cascadeDelete on `parent_id`
4. Create `notifications` collection
5. Add PocketBase JS hooks for notification creation + push triggers

## New Routes

| Route | Page | Description |
|-------|------|-------------|
| `/u/:userId/routine` | `RoutineViewPage` | View user's current routine (read-only) |
| `/notifications` | `NotificationsPage` | Notification center |

## New Files

**Pages:**
- `src/pages/RoutineViewPage.tsx`
- `src/pages/NotificationsPage.tsx`

**Hooks:**
- `src/hooks/useComments.ts`
- `src/hooks/useNotifications.ts`

**Components:**
- `src/components/CommentsSheet.tsx`
- `src/components/EmojiPicker.tsx` (inline reaction picker)
- `src/components/NotificationBadge.tsx`

**Server hooks:**
- PocketBase JS hooks for notification creation on follows, reactions, comments, challenge_participants

**Migrations:**
- Update feed_reactions index
- Create comments collection
- Create notifications collection

## Out of Scope

- Copying or cloning another user's routine
- Direct messaging between users
- Group chats
- Comment editing (only create and delete)
- Notification preferences/settings (notify for all events)
- Email notifications
- Server-side rate limiting for comments
- Orphan cleanup for comments/reactions on deleted sessions
- User opt-out of program visibility
