/**
 * Client for the server-authoritative battle API (`pb_hooks/battle_api.pb.js`, #356).
 *
 * Every function here returns a full `BattleSnapshot`, because that is the contract:
 * the server is authoritative and the client replaces its state with what comes back
 * rather than patching it. Nothing in this module writes to `battles`,
 * `battle_participants` or `battle_invites` through the collection API — their
 * mutation rules are `null` and always will be.
 */
import { pb } from './pocketbase'
import type {
  Battle,
  BattleConfiguration,
  BattleInviteIssued,
  BattleInvitePreview,
  BattleParticipant,
  BattleProgress,
  BattleSnapshot,
} from '../types/battle'
import { isBattleActiveForMe, validateBattleConfiguration } from './battle'

/**
 * How many open battles to look at before giving up on finding one that is still mine.
 * A user is realistically in one; the extra rows only cover the case where a stale lobby
 * someone else keeps alive sorts above the battle I am actually running.
 */
const ACTIVE_BATTLE_SCAN = 10

/** How many closed battles the history reads at once. */
const BATTLE_HISTORY_PAGE = 30

/** A `battles` row with the caller's seat attached via the participants back-relation. */
interface ExpandedBattle extends Battle {
  expand?: {
    battle_participants_via_battle?: Pick<BattleParticipant, 'user' | 'status'>[]
  }
}

/** A refusal from the battle API, carrying the machine-readable code the server sent. */
export class BattleApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'BattleApiError'
    this.status = status
    this.code = code
  }

  /** The battle moved on without us; the caller should re-fetch instead of retrying. */
  get isStale(): boolean {
    return this.status === 409 || this.status === 410 || this.status === 404
  }
}

interface ErrorBody {
  error?: string
  message?: string
}

function toBattleApiError(err: unknown): BattleApiError {
  const anyErr = err as { status?: number; response?: ErrorBody; message?: string }
  const status = typeof anyErr?.status === 'number' ? anyErr.status : 0
  const body = anyErr?.response ?? {}
  // Status 0 means the request never reached the server. The SDK's own fallback message
  // for that is the untranslated "Something went wrong.", which surfaced verbatim in the
  // battle screen the moment the phone lost the backend. Tag it so the UI can say the one
  // thing that is actually true and actionable: you are offline.
  const code = status === 0 ? 'network' : body.error || 'request_failed'
  return new BattleApiError(
    status,
    code,
    body.message || anyErr?.message || 'Battle request failed',
  )
}

async function send<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  try {
    return await pb.send(path, {
      method,
      body,
      // Battle calls are user-initiated and often fire in quick succession (ready,
      // progress); the SDK auto-cancels same-key requests, which would drop the earlier
      // ones on the floor. `requestKey: null` opts each call out of that grouping.
      requestKey: null,
    })
  } catch (err) {
    throw toBattleApiError(err)
  }
}

/**
 * Idempotency keys are what make a double-tap a no-op instead of a duplicate row or a
 * spurious "invalid transition". Generate one per user intent, not per retry: retrying
 * with the *same* key is the entire point.
 */
export function newIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2, 12)
  return `${Date.now().toString(36)}-${random}`
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Create the draft. This is the only battle write that goes through the collection
 * API — the createRule pins it to `status: draft`, `revision: 0` and the caller as
 * creator, and a `pb_hooks` guard validates the configuration.
 */
export async function createBattleDraft(
  creatorUserId: string,
  config: BattleConfiguration,
): Promise<string> {
  const errors = validateBattleConfiguration(config)
  if (errors.length > 0) {
    // Fail here rather than on the round-trip: the server checks the same rules, but
    // the caller gets a usable message instead of a concatenated 400.
    throw new BattleApiError(400, 'invalid_configuration', errors.join('; '))
  }
  const record = await pb.collection('battles').create({
    creator: creatorUserId,
    status: 'draft',
    revision: 0,
    config,
  }, { requestKey: null })
  return record.id
}

/**
 * The caller's battle that is still in flight, if any.
 *
 * Exists so that killing the app is not the same as losing the battle: the server keeps
 * the state, but without this the user has no route back to it — the only entry point
 * is "new battle", which would start a second one. A plain collection read; the list
 * rule already narrows it to battles the caller created or joined.
 */
export async function findMyActiveBattle(): Promise<Battle | null> {
  const userId = pb.authStore.record?.id
  if (!userId) return null

  const page = await pb.collection('battles').getList(1, ACTIVE_BATTLE_SCAN, {
    filter: "status = 'draft' || status = 'lobby' || status = 'ready' || status = 'live'",
    // `battles` has no `created`/`updated` autodate fields, and PocketBase answers 400
    // for a sort on a column that does not exist — which this swallows as "no active
    // battle". The sort is not cosmetic either: without it the page comes back in an
    // arbitrary order and the caller can be sent into someone else's stale lobby
    // instead of the battle they are actually in.
    sort: '-last_activity_at',
    // The battle status alone does not say whether *I* still have a run to go back to:
    // a battle stays `live` while opponents work, long after I finished or left. The
    // back-relation carries my seat, and the participants read rule already limits what
    // comes back to rows I am allowed to see — including, always, my own.
    expand: 'battle_participants_via_battle',
    requestKey: null,
  })

  for (const item of page.items as unknown as ExpandedBattle[]) {
    const seats = item.expand?.battle_participants_via_battle ?? []
    const mine = seats.find((seat) => seat.user === userId) ?? null
    if (isBattleActiveForMe(item.status, mine?.status ?? null, item.creator === userId)) {
      return item as Battle
    }
  }
  return null
}

/**
 * My closed battles, newest first (#398).
 *
 * Reads the ranking straight off `final_standings` rather than calling the snapshot
 * endpoint per battle: a closed battle is immutable, and one request per row does not
 * survive a history list. Battles that closed before #398 come back with a null ranking
 * and are shown as a battle without a result, never as a loss.
 */
export async function listMyBattleHistory(limit = BATTLE_HISTORY_PAGE): Promise<Battle[]> {
  const userId = pb.authStore.record?.id
  if (!userId) return []

  const page = await pb.collection('battles').getList(1, limit, {
    filter: "status = 'finished' || status = 'cancelled' || status = 'expired'",
    // `finished_at` is only set on battles that ran; cancelled and expired ones fall
    // back to their last activity, which is when they actually ended.
    sort: '-finished_at,-last_activity_at',
    requestKey: null,
  })
  return page.items as unknown as Battle[]
}

export function getBattleSnapshot(battleId: string): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/snapshot`, 'GET')
}

/** draft → lobby. Also seats the creator as a participant: they train too. */
export function publishBattle(battleId: string, idempotencyKey?: string): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/publish`, 'POST', {
    idempotency_key: idempotencyKey,
  })
}

/** joined ⇄ ready. The battle follows: everyone ready → `ready`, anyone not → `lobby`. */
export function setBattleReady(
  battleId: string,
  ready: boolean,
  idempotencyKey?: string,
): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/ready`, 'POST', {
    ready,
    idempotency_key: idempotencyKey,
  })
}

/** ready → live. The returned `starts_at` is the only legitimate countdown source. */
export function startBattle(battleId: string, idempotencyKey?: string): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/start`, 'POST', {
    idempotency_key: idempotencyKey,
  })
}

/**
 * Report progress. Deliberately un-keyed: the server's monotonic clamp already makes a
 * replayed value a no-op, so a ledger row per tick would only grow without bound.
 */
export function reportBattleProgress(
  battleId: string,
  progress: Pick<
    BattleProgress,
    'completed_rounds' | 'completed_reps' | 'completed_time_seconds' | 'current_exercise_position'
  >,
): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/progress`, 'POST', { progress })
}

export function finishBattleParticipant(
  battleId: string,
  progress?: Pick<
    BattleProgress,
    'completed_rounds' | 'completed_reps' | 'completed_time_seconds' | 'current_exercise_position'
  >,
  idempotencyKey?: string,
): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/finish`, 'POST', {
    progress,
    idempotency_key: idempotencyKey,
  })
}

export function leaveBattle(battleId: string, idempotencyKey?: string): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/leave`, 'POST', {
    idempotency_key: idempotencyKey,
  })
}

export function cancelBattle(battleId: string, idempotencyKey?: string): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/cancel`, 'POST', {
    idempotency_key: idempotencyKey,
  })
}

/**
 * Play the same circuit again with the same group (#357).
 *
 * Returns the snapshot of a **brand-new** battle: new id, `revision: 0`, fresh invites.
 * The original is never touched — a result is a record, and rewriting it to host a
 * second run would destroy the first. The old invite tokens are bound to the old
 * battle's id, so they cannot open this one.
 *
 * Pass an idempotency key generated once per *intent*, not per call: reusing the key is
 * what makes a double-tap return the battle the first tap created instead of a second one.
 */
export function rematchBattle(battleId: string, idempotencyKey?: string): Promise<BattleSnapshot> {
  return send<BattleSnapshot>(`/api/battles/${battleId}/rematch`, 'POST', {
    idempotency_key: idempotencyKey,
  })
}

// ── Invites ──────────────────────────────────────────────────────────────────

/**
 * Issue a single-use invite token.
 *
 * The raw token comes back exactly once and is never stored server-side (only its
 * sha256). Put it in the share link and nowhere else: **never** log it, never send it
 * as an analytics property, never persist it outside the pending-invite handoff.
 */
export function createBattleInvite(battleId: string): Promise<BattleInviteIssued> {
  return send<BattleInviteIssued>(`/api/battles/${battleId}/invites`, 'POST', {})
}

export function revokeBattleInvites(battleId: string): Promise<{ revoked: number }> {
  return send<{ revoked: number }>(`/api/battles/${battleId}/invites/revoke`, 'POST', {})
}

/**
 * Landing metadata for an invite link. Unauthenticated: a friend who has not signed up
 * yet has to be able to see what they were invited to. Returns counts only.
 *
 * POST rather than GET on purpose — the token travels in the body so it never reaches
 * PocketBase's request log.
 */
export function previewBattleInvite(token: string): Promise<BattleInvitePreview> {
  return send<BattleInvitePreview>('/api/public/battle-invite', 'POST', { token })
}

/** Consume the token and take a seat. Requires an authenticated caller. */
export function joinBattle(token: string, idempotencyKey?: string): Promise<BattleSnapshot> {
  return send<BattleSnapshot>('/api/battles/join', 'POST', {
    token,
    idempotency_key: idempotencyKey,
  })
}
