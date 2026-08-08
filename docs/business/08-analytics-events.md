# Analytics & Growth Events

Version: **1**
Owner: Growth / Product
Destinations: OpenPanel web project and OpenPanel mobile project

The shared event facade lives in `packages/core/lib/analytics.ts`. Web and
mobile adapters are initialized in `apps/web/src/lib/init-core.ts` and
`apps/mobile/src/lib/init-core.ts`. Both adapters send to the self-hosted
OpenPanel API at `https://openpanel.guille.tech/api`; mobile buffers while
offline and only sends events outside development builds.

## Contract

Every canonical event includes `event_version: 1` and a non-empty `surface`.
Use the same property names and meanings on both platforms:

| Property | Meaning | Examples |
|---|---|---|
| `surface` | Product surface where the action occurred | `post_workout`, `challenge_detail`, `battle` |
| `source` | Immediate trigger or entry point | `workout_completion`, `quick_invite`, `race_lobby` |
| `workout_id` | Stable workout key, not title or note content | `p2_lun`, `free_1712345678` |
| `challenge_id` | PocketBase challenge id | `abc123` |
| `program_id` | PocketBase program id | `prog123` |
| `battle_id` | Canonical id for the current race/battle flow | `race123` |
| `share_type` | Asset or link shared | `workout`, `nutrition`, `race_result`, `invite_link` |
| `participant_count` | Count known immediately after the action | `1`, `4` |
| `result` | Outcome of the action | `viewed`, `joined`, `updated`, `completed`, `shared` |

Event-specific properties may be retained for analysis and backward
compatibility, but must be low-cardinality and non-sensitive. Never send
health notes, free-form meal content, exercise notes, email addresses, names,
GPS coordinates, or unnecessary personal data.

## Canonical event table

| Event | Trigger | Shared properties | Platforms | Success definition |
|---|---|---|---|---|
| `post_workout_action_viewed` | Completion screen renders after a workout | `surface`, `source`, `workout_id`, `result` | Web + mobile | Completion action screen can be reached without an error |
| `share_card_shared` | A card image is successfully shared | `surface`, `source`, `share_type`, `result`; optional `workout_id` | Web + mobile | Share sheet/export succeeds; cancelled shares are not counted |
| `invite_sent` | Referral invite is copied or handed to a share target | `surface`, `source`, `share_type`, `result` | Web | A link is copied or native share returns successfully |
| `invite_landing_viewed` | Referral landing route renders | `surface`, `source`, `result` | Web | Referral landing is viewed and code is stored |
| `referral_converted` | Signup creates a valid referral record | `surface`, `source`, `result` | Web + mobile core | Referral record is created successfully |
| `challenge_viewed` | Challenge detail/list item is displayed | `surface`, `source`, `challenge_id`, `participant_count`, `result` | Web + mobile | Challenge surface is visible |
| `challenge_joined` | User joins or is invited into a challenge | `surface`, `source`, `challenge_id`, `participant_count`, `result` | Web + mobile | Participant record is created successfully |
| `challenge_progress_updated` | Completed workout can contribute to an active challenge | `surface`, `source`, `workout_id`, `challenge_id`, `result` | Web + mobile core | One progress signal is emitted per active challenge and workout completion |
| `challenge_completed` | Expired challenge is closed | `surface`, `source`, `challenge_id`, `result` | Web + mobile core | Challenge status changes to `ended` |
| `program_joined` | Program enrollment becomes active | `surface`, `source`, `program_id`, `result` | Web + mobile core | Enrollment is created or reactivated |
| `program_milestone_completed` | All configured non-rest days in a program phase are complete | `surface`, `source`, `program_id`, `workout_id`, `result` | Web + mobile core | Phase completion is detected once per user/program/phase |
| `battle_created` | Existing race flow creates a battle | `surface`, `source`, `battle_id`, `participant_count`, `result` | Web + mobile | Race record is created |
| `battle_joined` | User joins an existing race/battle | `surface`, `source`, `battle_id`, `participant_count`, `result` | Web + mobile | Participant record is created |
| `battle_started` | Race countdown starts | `surface`, `source`, `battle_id`, `participant_count`, `result` | Web + mobile | Battle enters its active state |
| `battle_completed` | Race finishes and results are published | `surface`, `source`, `battle_id`, `participant_count`, `result` | Web + mobile | Battle enters its finished state |
| `battle_shared` | Battle invite link or result card is shared | `surface`, `source`, `battle_id`, `share_type`, `participant_count`, `result` | Web + mobile | Share sheet/export succeeds |

## Compatibility rules

Existing events remain available for current dashboards. In particular,
`card_type` remains on `share_card_shared`, `race_*` events remain emitted for
the existing race reports, and `program_selected` remains emitted alongside
the canonical `program_joined` event. Canonical events are emitted once per
successful action; compatibility events are not used as additional canonical
funnel steps.

## Growth funnel

Configure one OpenPanel funnel named **Completion → Return**:

1. `post_workout_action_viewed`
2. `share_card_shared` (filter `share_type = workout`)
3. `invite_sent` or `battle_shared`
4. `invite_landing_viewed`
5. `signup_completed`
6. `onboarding_completed`
7. `workout_completed`
8. `challenge_joined`
9. `session_started` within the selected return window

Use user/profile identity where available. Break down by `surface`, `source`,
`share_type`, and platform project. Do not include `code`, ids, or free-form
text as breakdown dimensions.

## OpenPanel dashboard specification

Create a dashboard called **Growth Loop v1** with these reports:

| Report | Type | Steps / event | Breakdown |
|---|---|---|---|
| Completion → Return | Funnel | Funnel above | `surface`, `source` |
| Referral conversion | Funnel | `invite_sent` → `invite_landing_viewed` → `signup_completed` | `share_type` |
| Challenge activation | Funnel | `challenge_viewed` → `challenge_joined` → `challenge_progress_updated` → `challenge_completed` | `surface` |
| Battle adoption | Funnel | `battle_created` → `battle_joined` → `battle_started` → `battle_completed` | `share_type` |
| Shares by type | Bar | `share_card_shared` | `share_type` |
| Program milestones | Line | `program_milestone_completed` | `program_id` |

This repository defines the report names, steps, filters, and breakdowns. The
OpenPanel workspace still needs an authenticated operator to create/save the
dashboard and confirm the exact UI labels.

## QA checklist

### Web

- Complete a program workout and confirm one `post_workout_action_viewed`.
- Share the workout card and confirm one `share_card_shared` with
  `share_type=workout`.
- Copy/share a referral invite and confirm `invite_sent`.
- Open the invite URL, register, and confirm `invite_landing_viewed` then
  `referral_converted`.
- Open a challenge, join it, complete a contributing workout, and confirm
  `challenge_viewed`, `challenge_joined`, and `challenge_progress_updated`.
- Create, join, start, finish, and share a race; confirm the five canonical
  `battle_*` events.

### Mobile

- Complete and share a workout while online and confirm the two workout events.
- Repeat the share flow while offline, reconnect, and confirm buffered delivery.
- Open the challenges list, join a challenge, complete a contributing workout,
  and confirm the challenge events.
- Select a program, complete every non-rest day in one phase, and confirm one
  `program_milestone_completed`.
- Create, join, start, finish, and share a race; confirm the canonical battle
  events after the mobile buffer flushes.

## Privacy review

The canonical helper only normalizes and versions the properties supplied by a
caller; it is not a general-purpose PII scrubber. Before adding a property,
verify that it is a stable identifier or low-cardinality product metadata.
Never pass notes, meal descriptions, health measurements, profile text,
coordinates, or raw URLs containing user data.
