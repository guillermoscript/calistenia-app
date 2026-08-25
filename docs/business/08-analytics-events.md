# Analytics & Growth Events

Version: **4**
Owner: Growth / Product
Destinations: OpenPanel web project and OpenPanel mobile project

> **Version 4 (2026-08-25, issue #636) — race events deduplicated, training
> funnel instrumented.** This version **breaks three saved reports on purpose**;
> read the migration notes before the deploy.
>
> - **`race_joined` and `race_started` were being emitted twice per action.**
>   The move to canonical names (v2) added the canonical call *alongside* the
>   legacy one instead of replacing it, and both used the same event name. Both
>   counts now drop by roughly half. **Any report that quotes an absolute number
>   of race joins or starts before this date is quoting double**, and any
>   conversion rate whose numerator or denominator mixes these with an
>   un-duplicated event was wrong in that direction.
> - **`race_finished` is renamed to `race_participant_finished`.** It fires once
>   per runner and always did; `race_completed` fires once per race, from the
>   creator's client. The two names read as synonyms, so no report could tell
>   the numerator from the denominator of a race completion rate. **Reports
>   filtering `race_finished` stop matching anything** and must be pointed at the
>   new name.
> - **`screen_view` on mobile now carries the route pattern**
>   (`/challenges/[id]`) as the screen name, with the resolved path in a `path`
>   property. Before, every challenge, race and battle id created its own screen,
>   so screen reports were an unbounded list of ids with no aggregate row per
>   screen. **Reports grouping by screen name will show far fewer, much larger
>   rows**, and historical rows keep their old id-bearing names.
> - **Additive:** the training funnel gains `session_exited`, a `reason` on
>   `workout_abandoned`, and a shared property block on all four lifecycle
>   events (see "Training session funnel"). Nothing about them breaks an
>   existing report; `workout_abandoned` does start firing on mobile, where it
>   never fired at all, so its volume jumps.

> **Version 3 (2026-08-15, issue #357) — battle results and rematch.**
> Two additions, both mobile-only and both additive: `battle_results_viewed`
> fires once per viewer per battle when the results screen opens, and
> `battle_rematch_created` fires when a closed battle spawns a new one.
> `battle_shared` gains a second `share_type`: it used to mean the lobby invite
> link and only that, so **any saved report that assumed `battle_shared` implies
> an invite must now filter `share_type = invite_link`** — the new
> `share_type = result_card` is someone showing off a finished battle, which is a
> different moment in the funnel. Nothing was renamed and nothing was removed.

> **Version 2 (2026-08-11, issue #356) — GPS races moved off the `battle_*` names.**
> Until now the cardio race flow emitted `battle_created` / `battle_joined` /
> `battle_started` / `battle_completed` / `battle_shared` with `battle_id` set to a
> `races` record id. Collaborative circuit battles (`battles` collection) are a
> different feature with the same natural event names, so keeping both would have
> produced a permanently ambiguous funnel. Races now emit `race_*` with a `race_id`
> property; `battle_*` with `battle_id` means a circuit battle and nothing else.
> **Any saved OpenPanel report built on `battle_*` before this date is measuring
> races** and must be pointed at `race_*` to keep its old meaning.

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
| `surface` | Product surface where the action occurred | `post_workout`, `challenge_detail`, `race`, `battle` |
| `source` | Immediate trigger or entry point | `workout_completion`, `quick_invite`, `race_lobby` |
| `workout_id` | Stable workout key, not title or note content | `p2_lun`, `free_1712345678` |
| `challenge_id` | PocketBase challenge id | `abc123` |
| `program_id` | PocketBase `programs` id — the training-program curriculum | `prog123` |
| `community_program_id` | PocketBase `community_programs` id. Only on `community_program_*` events | `cprog123` |
| `milestone_id` | `community_program_milestones` id, or `phase_{n}` for `program_milestone_completed` | `ms123`, `phase_2` |
| `race_id` | PocketBase `races` id. Only on `race_*` events | `race123` |
| `battle_id` | PocketBase `battles` id. Only on `battle_*` events | `btl123` |
| `platform` | Which app produced the event: `web`, `mobile`, or `unknown`. Stamped by core from the client identity, so it is never left to the caller. **Exception:** on `share_card_shared` this property means the share *destination* (`whatsapp`, `twitter`), which predates the stamp and still wins | `web`, `mobile` |
| `share_type` | Asset or link shared | `workout`, `nutrition`, `race_result`, `invite_link` |
| `participant_count` | Count known immediately after the action | `1`, `4` |
| `action` | Which option was chosen on a surface that offers several | `share`, `invite`, `challenge`, `progress`, `repeat` |
| `result` | Outcome of the action | `viewed`, `selected`, `joined`, `updated`, `completed`, `shared` |

Event-specific properties may be retained for analysis and backward
compatibility, but must be low-cardinality and non-sensitive. Never send
health notes, free-form meal content, exercise notes, email addresses, names,
GPS coordinates, or unnecessary personal data.

## Canonical event table

| Event | Trigger | Shared properties | Platforms | Success definition |
|---|---|---|---|---|
| `post_workout_action_viewed` | Completion screen renders after a workout | `surface`, `source`, `workout_id`, `result` | Web + mobile | Completion action screen can be reached without an error |
| `post_workout_action_selected` | A growth action is tapped in the post-workout panel | `surface`, `source`, `workout_id`, `action`, `result`; optional `challenge_id` | Web + mobile | One event per tap. Emitted *in addition to* the canonical event each action already produces (`share_card_shared`, `invite_sent`, `challenge_viewed`), which stay where they were so the existing funnels are unaffected |
| `share_card_shared` | A card image is shared or reaches a native sheet whose final result is not observable | `surface`, `source`, `share_type`, `platform`, `result`, `share_confirmed`; optional `workout_id` | Web + mobile | One event per completed share invocation; observable dismissals and failures emit nothing. See "Share confirmation" below |
| `invite_sent` | Referral invite is copied, handed to a share target, or sent to a specific user | `surface`, `source`, `share_type`, `result`; optional `challenge_id` | Web + mobile core | A link is copied, native share returns successfully, or an invite record is created |
| `invite_landing_viewed` | Referral landing route renders | `surface`, `source`, `result`; optional `code`, `has_challenge`, `platform` | Web + mobile | Referral landing is viewed and code is stored. Mobile emits it from the `/invite/[code]` route before redirecting to signup |
| `referral_converted` | Signup creates a valid referral record | `surface`, `source`, `result`; optional `referrer_id` | Web + mobile core | Referral record is created successfully. `source` distinguishes the path: `quick_invite` (attribution captured at signup) vs `manual_code` (code entered in-app via `trackReferral`) |
| `referral_status_viewed` | Referral status screen finishes loading | `surface`, `source`, `result`, `referral_count`, `pending_rewards` | Web + mobile | Emitted once per screen visit, only after the data resolves without error, so it counts screens that actually showed a status. `pending_rewards` counts referrals with no matching `point_transactions` row |
| `challenge_viewed` | Challenge detail/list item is displayed | `surface`, `source`, `challenge_id`, `participant_count`, `result` | Web + mobile | Challenge surface is visible; once per challenge per screen visit, and only after the challenge actually loads |
| `challenge_joined` | User joins a challenge themselves | `surface`, `source`, `challenge_id`, `participant_count`, `result` | Web + mobile | Participant record is created successfully by the joining user. Inviting somebody else emits `invite_sent`, not this event — the inviter's device carries the inviter's analytics identity |
| `challenge_progress_updated` | Completed workout can contribute to an active challenge | `surface`, `source`, `workout_id`, `challenge_id`, `result` | Web + mobile core | One progress signal per workout completion and per challenge the workout can actually score (metric-aware; free/manual sessions included) |
| `challenge_completed` | Expired challenge is closed | `surface`, `source`, `challenge_id`, `result` | Web + mobile core | Challenge status changes to `ended` |
| `program_joined` | Program enrollment becomes active | `surface`, `source`, `program_id`, `result` | Web + mobile core | Enrollment is created or reactivated |
| `program_milestone_completed` | All configured non-rest days in a program phase are complete | `surface`, `source`, `program_id`, `workout_id`, `milestone_id`, `result` | Web + mobile core | Phase completion is detected once per user/program/phase, from PocketBase rows scoped to that program (strength days in `sessions`, cardio days in `cardio_sessions`) |
| `community_program_viewed` | Community program detail finishes loading | `surface=community_program`, `source`, `community_program_id`, `result` | Web + mobile core | Emitted once per program per screen visit, only after the program actually resolves. `result` distinguishes a member (`joined`) from a browser (`viewed`) |
| `community_program_joined` | Membership becomes active | `surface=community_program`, `source`, `community_program_id`, `result` | Web + mobile core | The `(program, user)` row is created or reactivated. A repeat tap on an already-active membership emits nothing, so the event counts joins and not taps. `result` is `joined` for a first join and `resumed` when a previously-left membership is reactivated — a resume keeps the original `started_at`, so it is not a fresh cohort entry |
| `community_program_left` | Member leaves a community program | `surface=community_program`, `source`, `community_program_id`, `result` | Web + mobile core | Membership status flips to `left`. The row is never deleted, so leaving twice emits once |
| `community_program_milestone_completed` | A weekly milestone's target is met inside its own week window | `surface=community_program`, `source`, `community_program_id`, `milestone_id`, `result` | Web + mobile core | Detected on recompute, then suppressed by a local marker so it fires once per user/program/milestone. Because milestone completion is derived rather than stored, a later deletion of the qualifying workout lowers the displayed progress but does not re-arm the event |
| `community_program_completed` | Every milestone in the program is complete | `surface=community_program`, `source`, `community_program_id`, `result` | Web + mobile core | Fires once per user/program, on the recompute that first observes all milestones complete. A program with zero milestones never completes |
| `race_created` | GPS race is created | `surface=race`, `source`, `race_id`, `participant_count`, `result` | Web + mobile | Race record is created |
| `race_joined` | User joins an existing GPS race | `surface=race`, `source`, `race_id`, `participant_count`, `result` | Web + mobile | Participant record is created |
| `race_started` | Race countdown starts | `surface=race`, `source`, `race_id`, `participant_count`, `result` | Web + mobile | Race enters its active state |
| `race_completed` | Race finishes and results are published | `surface=race`, `source`, `race_id`, `participant_count`, `result` | Web + mobile | Race enters its finished state. Emitted once per **race** by the creator's client, so manual finishes, auto-finish and the `ends_at` watchdog all count exactly once (a race finished while the creator is offline is not counted) |
| `race_participant_finished` | One runner finishes their own race | `surface=race`, `source=race_active`, `race_id`, `result=finished`, `distance_km`, `duration_seconds` | Web + mobile | Once per **participant**, from that runner's own device. Was called `race_finished` until v4, which made it indistinguishable by name from `race_completed`. This is the numerator of a race completion rate; `race_joined` is its denominator |
| `race_shared` | Race invite link or result card is shared | `surface=race`, `source`, `race_id`, `share_type`, `participant_count`, `result`, `share_confirmed` | Web + mobile | Share sheet/export succeeds; see "Share confirmation" below |
| `battle_created` | Collaborative circuit battle draft is created | `surface=battle`, `source`, `battle_id`, `participant_count`, `result` | Mobile | `battles` record is created in `draft` |
| `battle_joined` | Invite token is consumed and a participant row is accepted | `surface=battle`, `source`, `battle_id`, `participant_count`, `result` | Mobile | Server creates the `(battle, user)` participant row. Emitted by the joining device |
| `battle_started` | Battle enters `live` | `surface=battle`, `source`, `battle_id`, `participant_count`, `result` | Mobile | The creator's `start` call is accepted server-side. Emitted once by the creator's device, not by every client that sees the realtime update |
| `battle_completed` | Battle enters `finished` and results are available | `surface=battle`, `source`, `battle_id`, `participant_count`, `result` | Mobile | Emitted once per battle by the creator's device when it observes the terminal status |
| `battle_shared` | Battle invite link (`share_type=invite_link`) or finished-result card (`share_type=result_card`) is shared | `surface=battle`, `source`, `battle_id`, `share_type`, `participant_count`, `result`, `share_confirmed` | Mobile | Share sheet returns; see "Share confirmation" below. A result-card share also emits `share_card_shared` with `card_type=battle_result`, from the same outcome, so the two can never disagree. **The raw invite token is never sent as an analytics property**, and the shared image carries no invite token either |
| `battle_results_viewed` | The results screen of a terminal battle is opened | `surface=battle`, `source`, `battle_id`, `participant_count`, `result` | Mobile | Once per viewer per battle, not once per battle — unlike `battle_completed`, the question it answers is whether anyone looks at the result they earned. `result` carries the viewer's own outcome (`won`, `tied`, `placed`, `solo`, `left`, `none`) |
| `battle_rematch_created` | A closed battle spawns a new one | `surface=battle`, `source`, `battle_id`, `participant_count`, `result` | Mobile | The server accepted `POST /api/battles/{id}/rematch`. `battle_id` is the **new** battle; a double-tap replays the idempotency key and creates nothing, so it is emitted once per rematch. Also emits `invite_sent` with `share_type=rematch_invite` when former participants were re-invited |

The four training-lifecycle events (`session_started`, `workout_completed`,
`session_exited`, `workout_abandoned`) predate this contract and keep their
legacy names, so they are not in the table above. Their shape is specified in
the next section and follows the same versioning and privacy rules.

## Training session funnel

A strength session ends in **exactly one** terminal event (#636). Until v4 the
decision was split across three modules that did not talk to each other, so
sessions could end in none — leaving on purpose, and every session on mobile —
or in two: finishing a workout and then closing the tab emitted both
`workout_completed` and `workout_abandoned`. Neither a completion rate nor an
abandonment rate could be computed from that.

`useActiveSessionState` now owns the outcome and latches it on the first
terminal event:

| Outcome | Event | Trigger |
|---|---|---|
| Completed | none beyond `workout_completed` | Session progress reaches the `celebrate` phase, which the session machine sets immediately after the workout is marked done |
| Left on purpose | `session_exited` | The session is closed from the UI without having reached `celebrate` |
| Tab or window closed | `workout_abandoned`, `reason=page_closed` | `beforeunload` **and** `pagehide` (web only). Both may fire on one exit; the latch counts one |
| Expired after 24 h | `workout_abandoned`, `reason=expired` | The persisted session is dropped on the next app start |
| Replaced by another session | `workout_abandoned`, `reason=replaced` | A different `workout_key` is started while one is still open |

The last two rows are the only abandonment signal that exists on native, where
there is no `beforeunload` of any kind. Backgrounding the app is deliberately
**not** treated as abandonment: minimising an app mid-workout is normal, and
counting it would inflate the number until it means nothing.

Two caveats worth knowing when reading the numbers:

- **`reason=expired` arrives late.** The event is emitted when the app is next
  opened, which can be days after the workout. `duration_seconds` is real (start
  to last save), but the event timestamp is not the moment of abandonment.
- **A session abandoned on a device that is never opened again is never
  counted.** All five outcomes are client-side.

### Shared properties

All four lifecycle events — `session_started`, `workout_completed`,
`session_exited`, `workout_abandoned` — carry the same block, built by
`packages/core/lib/session-funnel.ts`, so the funnel can be segmented by any of
them:

| Property | Notes |
|---|---|
| `workout_key` | `p2_mie` for a program day, `free_<ts>` / `manual_<ts>` otherwise |
| `source` | `program` or `free` |
| `is_free_session` | Kept from the pre-v4 shape so existing breakdowns survive |
| `phase`, `day_id` | Derived from `workout_key`. A free session has no `phase` — it is omitted rather than sent as `0` |
| `program_id` | The active `programs` id. Omitted on free sessions |
| `exercise_count`, `sets_logged`, `completion_pct` | `completion_pct` is `sets_logged` over the workout's planned sets, capped at 100. Omitted when the workout has no countable planned sets (a workout of "multiple"-set exercises) |
| `duration_seconds` | Start to end of the session |
| `platform`, `surface=session`, `event_version` | As in the contract above |

`workout_completed` is emitted from a different module (the progress mutation,
which is what actually writes the session row) and therefore knows only what
was *logged*, not what was *planned*: it carries `sets_logged` but not
`exercise_count` or `completion_pct`. Segment completion by `program_id`,
`phase`, `platform` or `source` — those are present on all four.

## Share confirmation

Not every platform tells us whether a share actually went out, so share events
carry a `share_confirmed` boolean. Count confirmed shares with
`share_confirmed = true` and `result = shared`; `result = opened` means the
native sheet completed without exposing its final outcome. Observable
cancellations and native failures do not emit `share_card_shared`.

| Path | `share_confirmed` | Why |
|---|---|---|
| Web `navigator.share` resolves | `true` | The Web Share API only resolves when the user goes through with it |
| Web fallback download (`result: downloaded`) | `false` | Cancelling the sheet falls back to downloading the PNG — an export, not a send |
| iOS `Share.share` → `sharedAction` | `true` | iOS reports `dismissedAction` on cancel, which is already filtered out |
| Android `Share.share` (`result: opened`) | `false` | React Native always resolves with `sharedAction` on Android, dismissal included |
| `expo-sharing` `shareAsync` (`result: opened`) | `false` | Resolves to `void`; the outcome is not observable |

## Compatibility rules

Existing events remain available for current dashboards. In particular,
`card_type` remains on `share_card_shared`, and `program_selected` remains
emitted alongside the canonical `program_joined` event. Canonical events are
emitted once per completed action (with unconfirmed share outcomes labeled
`opened`); compatibility events are not used as additional canonical funnel
steps.

v4 is the one deliberate exception to "nothing is renamed or removed":
`race_finished` no longer exists, and the volume of `race_joined` and
`race_started` halves. Duplicate emissions and a pair of synonymous names are
not backward compatibility — they are wrong numbers, and keeping them would
have meant every future race report inheriting the error. See the version note
at the top for what to repoint.

## Growth funnel

Configure one OpenPanel funnel named **Completion → Return**:

1. `post_workout_action_viewed`
2. `share_card_shared` (filter `share_type = workout`; add
   `share_confirmed = true` when the funnel must represent confirmed sends,
   while `result = opened` measures unconfirmed native-sheet completions)
3. `invite_sent`, `race_shared` or `battle_shared`
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
| Race adoption | Funnel | `race_created` → `race_joined` → `race_started` → `race_participant_finished` | `share_type` |
| Training completion | Funnel | `session_started` → `workout_completed` | `program_id`, `phase`, `platform`, `source` |
| Abandonment causes | Bar | `workout_abandoned` | `reason` |
| Battle adoption | Funnel | `battle_created` → `battle_joined` → `battle_started` → `battle_completed` | `share_type` |
| Battle replay | Funnel | `battle_completed` → `battle_results_viewed` → `battle_rematch_created` | `result` |
| Shares by type | Bar | `share_card_shared` (filter `share_confirmed = true` for confirmed sends) | `share_type` |
| Post-workout panel | Bar | `post_workout_action_selected` | `action` |
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
- Open `/referrals` and confirm one `referral_status_viewed` with a
  `referral_count` matching the list and a `pending_rewards` count matching the
  rows badged as pending.
- Open a challenge, join it, complete a contributing workout, and confirm
  `challenge_viewed`, `challenge_joined`, and `challenge_progress_updated`.
- Create, join, start, finish, and share a race; confirm the canonical `race_*`
  events and that **no** `battle_*` event is emitted by the race flow. Confirm
  `race_joined` and `race_started` fire **once** per action, not twice, and that
  finishing emits `race_participant_finished` (not `race_finished`).
- Start a program workout, log a set, and leave with the close button; confirm
  one `session_exited` with `program_id`, `phase`, `sets_logged` and
  `completion_pct`, and **no** `workout_abandoned`.
- Start a workout, log sets, finish it, and then close the tab from the
  celebration panel; confirm one `workout_completed` and **no**
  `workout_abandoned` — this pairing used to emit both.
- Start a workout and close the tab mid-set; confirm exactly one
  `workout_abandoned` with `reason=page_closed` (not two, even though both
  `beforeunload` and `pagehide` fire).
- Start a workout, leave it open, then start a different day; confirm one
  `workout_abandoned` with `reason=replaced` carrying the **first** workout's
  key and set count.

### Mobile

- Complete and share a workout while online and confirm the two workout events
  (the share button on the celebration screen emits `share_card_shared` too),
  including `workout_id`, `platform`, and the classified `result`.
- Share from workout history, PR, streak, cardio, nutrition, and progress-photo
  surfaces; confirm one event per invocation and the expected `share_type`.
- On iOS native fallback, dismiss the sheet and confirm no event. Disable an
  available target or force a native failure, retry, and confirm only the retry
  emits. Android and `expo-sharing` image paths report `result=opened` because
  their APIs cannot distinguish delivery from dismissal.
- Repeat the share flow while offline, reconnect, and confirm buffered delivery.
- Open the challenges list, join a challenge, complete a contributing workout,
  and confirm the challenge events.
- Select a program, complete every non-rest day in one phase (including any
  cardio day), and confirm one `program_milestone_completed`. Switching to a
  second program must not emit its milestone until that program's own days are
  done.
- Create, join, start, finish, and share a race; confirm the canonical `race_*`
  events after the mobile buffer flushes.
- Create a circuit battle, share the invite, join it from a second account, start
  it, and finish it; confirm `battle_created`, `battle_joined`, `battle_started`
  and `battle_completed`, each exactly once, and confirm no `battle_shared`
  payload carries the raw invite token.
- On that finished battle, open the results screen and confirm one
  `battle_results_viewed` per account that opens it. Share the result card and
  confirm one `battle_shared` with `share_type=result_card` alongside one
  `share_card_shared` with `card_type=battle_result`; cancel a share and confirm
  neither is emitted.
- Tap Revancha twice in quick succession and confirm exactly one
  `battle_rematch_created`, one new battle, and that the other account gets the
  rematch push. Confirm the old invite link no longer opens anything.
- Open an `/invite/<code>` link while logged out and confirm one
  `invite_landing_viewed` before the signup screen appears.
- Open Profile → Referidos and confirm one `referral_status_viewed`; copy and
  share the link and confirm one `invite_sent` per invocation with
  `surface=referrals` and `source=referral_status`.
- Tap a referral push notification and confirm it lands on the referrals screen
  rather than the friends list.
- Open a challenge detail and then a race detail; confirm the `screen_view`
  names are `/challenges/[id]` and `/races/[id]` — the pattern, not the id — and
  that the resolved route arrives in `path`.
- Start a program workout, leave it open, and start a different day; confirm one
  `workout_abandoned` with `reason=replaced`. This is the abandonment signal that
  did not exist at all on mobile before v4.
- Start a workout, force-quit the app, and reopen it more than 24 h later;
  confirm one `workout_abandoned` with `reason=expired` and a
  `duration_seconds` that matches the workout, not the elapsed 24 h.
- Complete a workout on mobile and confirm one `workout_completed` carrying
  `program_id`, `phase`, `platform=mobile` and `sets_logged`.

## Privacy review

The canonical helper only normalizes and versions the properties supplied by a
caller; it is not a general-purpose PII scrubber. Before adding a property,
verify that it is a stable identifier or low-cardinality product metadata.
Never pass notes, meal descriptions, health measurements, profile text,
coordinates, or raw URLs containing user data.
