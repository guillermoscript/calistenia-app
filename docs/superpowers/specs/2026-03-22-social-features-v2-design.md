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

**DB changes:** The `feed_reactions` collection already has an `emoji` (text) field. Currently hardcoded to 🔥. Changes:
- Remove the hardcode; allow storing any of the 5 emojis
- Update unique constraint to `(session_id, reactor, emoji)` — a user can place multiple distinct emojis on the same session

**UI changes (FeedCard):**
- Replace the single 🔥 button with an inline emoji picker (horizontal bar with the 5 emojis)
- Show grouped counters below each session (e.g., 🔥3 💪2)
- Tap an emoji = toggle (same behavior as now, per emoji)

**Hook changes (`useReactions`):**
- `toggleReaction(sessionId, emoji)` — accept emoji parameter instead of hardcoding
- `getReactions(sessionIds)` — return grouped by emoji with counts
- `hasReacted(sessionId, emoji)` — check per emoji

### 1.2 Visible Program/Routine

#### Public Profile (`UserProfilePage`)

New section "Programa actual":
- Shows: program name, current phase, assigned routine name
- "Ver rutina" button opens `RoutineViewPage` with full detail
- If no active program: "Sin programa activo"

#### Activity Feed (`ActivityFeedPage`)

- Each FeedCard adds the program name as subtitle (e.g., "Programa Fuerza — Día Push")
- Tap on program name → navigates to `RoutineViewPage` (read-only)

#### New Page: `RoutineViewPage`

- Displays a user's routine in full detail: exercises, sets, reps, rest periods
- Read-only — no editing or copying
- Accessible from public profile and from feed cards
- Route: `/u/:userId/routine` or `/routine/:routineId`
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
| `parent_id` | relation (comments), nullable | Parent comment if this is a reply |
| `created` | auto | Timestamp |

**Indexes:**
- `(session_id, created)` — load comments in order

**API rules:**
- Create: any authenticated user
- Delete: only the comment author
- Read: any authenticated user
- Update: not allowed (no editing comments)

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
- `addComment(sessionId, text, parentId?)` — create comment or reply
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
- Read: only the notification owner
- Update: only the notification owner (to mark as read)
- Create: any authenticated user (client creates after actions)
- Delete: not allowed

### 3.2 Notification Triggers

| Event | Type | Example Message |
|-------|------|-----------------|
| Someone follows you | `follow` | "**Juan** te empezó a seguir" |
| Reaction on your session | `reaction` | "**Juan** reaccionó 💪 a tu sesión" |
| Comment on your session | `comment` | "**Juan** comentó en tu sesión" |
| Reply to your comment | `comment_reply` | "**Juan** respondió a tu comentario" |
| Challenge invitation | `challenge_invite` | "**Juan** te invitó al desafío X" |

**Creation:** Notifications are created client-side as a side effect after the primary action (follow, react, comment). The corresponding hook (`useFollows`, `useReactions`, `useComments`) creates the notification record. Self-notifications are suppressed.

### 3.3 In-App UI

**Navigation badge:**
- Bell icon 🔔 in the navigation bar with red badge showing unread count
- Tap → opens `NotificationsPage`

**NotificationsPage:**
- Chronological list of notifications
- Each item: actor avatar, message text, relative time, highlighted background if unread
- Tap notification → mark as read + navigate to resource (profile, session, challenge)
- "Marcar todas como leídas" button at top
- Notifications visible on screen auto-mark as read

### 3.4 Push Notifications

**Service Worker (PWA):**
- Register service worker for push notifications
- Use PocketBase realtime subscriptions on the `notifications` collection to detect new notifications
- When a new notification arrives and the app is in background → show system push notification
- Push permission is requested on first app visit with an explanation of why

### 3.5 Hook: `useNotifications`

- `getNotifications(limit?)` — load paginated notifications
- `getUnreadCount()` — count for the badge
- `markAsRead(notificationId)` — mark individual
- `markAllAsRead()` — mark all
- `subscribeToNew(callback)` — realtime via PocketBase for live push and badge updates

---

## Data Flow Summary

```
User Action → Primary Hook (create record) → Notification Hook (create notification)
                                            ↓
                                   PocketBase Realtime
                                            ↓
                              Service Worker → Push Notification
                              NotificationsPage → Badge Update
```

## Migration Order

1. Update `feed_reactions` unique index to include emoji
2. Create `comments` collection
3. Create `notifications` collection

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
