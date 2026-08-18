/**
 * Carries a battle invite token across the signup round-trip (#356).
 *
 * A logged-out friend who taps an invite link has to install the app, create an
 * account and only then join — several minutes and one app restart later. Without a
 * handoff the token would be lost at the login screen, which is why invites live for
 * 24 hours rather than minutes.
 *
 * Same mechanism as the referral-code capture in `useAuth`, with one extra rule: the
 * token is a bearer credential for one lobby seat, so it is cleared as soon as it is
 * read, and on any sign-out. It is never logged and never sent to analytics.
 */
import { storage } from '../platform'

const BATTLE_INVITE_KEY = 'calistenia_battle_invite_token'

/** Stash a token from a deep link so it survives the signup flow. */
export function captureBattleInviteToken(token: string): void {
  if (!token) return
  storage.setItem(BATTLE_INVITE_KEY, token)
}

/**
 * Read and clear the pending token. Single-read on purpose: a token left behind would
 * try to re-join on the next launch, long after it was consumed.
 */
export function consumeBattleInviteToken(): string | null {
  const token = storage.getItem(BATTLE_INVITE_KEY)
  if (token) storage.removeItem(BATTLE_INVITE_KEY)
  return token
}
