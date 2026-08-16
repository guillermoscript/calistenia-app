/**
 * repos/pb.ts — the two primitives every repo is built on (#480).
 *
 * Design rules for `src/api/repos/*` (the data-access layer of the MCP tools):
 *  - `pb` is ALWAYS the first argument. There is no module-level client: each
 *    request builds its own authenticated `PocketBase` (see auth.ts) and the
 *    cron paths use the superuser client from admin-pb.ts. Passing it in
 *    keeps that model intact and makes repos testable with a hand-rolled stub.
 *  - `requestKey: null` on every read. The PocketBase SDK auto-cancels a
 *    request when an identical one (same collection + params) is still in
 *    flight; tools routinely `Promise.all` the same lookups, and about half of
 *    the inline call sites forgot the flag — those were the ones that could
 *    come back empty with a `ClientResponseError 0` under concurrency.
 *  - Filters use `{:userId}` and are always built with `pb.filter()` (no
 *    string interpolation of user input).
 *  - Repos return records or `null`; they never format text. Domain math
 *    stays in the tool (or in @calistenia/core), not here.
 */

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";

/** The subset of the SDK a repo touches — what a test stub has to provide. */
export type PB = Pick<PocketBase, "collection" | "filter">;

export type { RecordModel };

export interface ReadOptions {
  /** Comma-separated projection. Omit for the full record. */
  fields?: string;
  sort?: string;
  expand?: string;
}

/**
 * The per-user singleton pattern (`settings`, `nutrition_goals`, `user_stats`,
 * latest `lumbar_checks`): first record where `user = userId`, or null.
 * `sort` picks "which one" when the collection holds many rows per user
 * (e.g. `-date` → most recent).
 */
export async function getUserSingleton<T extends RecordModel = RecordModel>(
  pb: PB,
  collection: string,
  userId: string,
  opts: ReadOptions = {},
): Promise<T | null> {
  return pb
    .collection(collection)
    .getFirstListItem<T>(pb.filter("user = {:userId}", { userId }), { ...opts, requestKey: null })
    .catch(() => null);
}

/**
 * Update the user's singleton row if it exists, otherwise create it with
 * `user: userId`. Returns the resulting record.
 */
export async function upsertUserSingleton<T extends RecordModel = RecordModel>(
  pb: PB,
  collection: string,
  userId: string,
  data: Record<string, unknown>,
): Promise<T> {
  const existing = await getUserSingleton<T>(pb, collection, userId, { fields: "id" });
  if (existing) return pb.collection(collection).update<T>(existing.id, data);
  return pb.collection(collection).create<T>({ user: userId, ...data });
}

export interface RangeQuery extends ReadOptions {
  /** Field the range applies to: `completed_at`, `logged_at`, `date`, `started_at`… */
  field: string;
  /** Inclusive lower bound, in the same format the field stores (PB datetime or YYYY-MM-DD). */
  from: string;
  /** Inclusive upper bound. Omit for "from `from` onwards". */
  to?: string;
}

/**
 * The per-user ranged read (`user = userId && field >= from [&& field <= to]`)
 * that ~30 tool call sites spelled out by hand with slightly different quotes,
 * param names and `requestKey` handling.
 */
export async function listUserRange<T extends RecordModel = RecordModel>(
  pb: PB,
  collection: string,
  userId: string,
  q: RangeQuery,
): Promise<T[]> {
  const { field, from, to, ...opts } = q;
  const filter =
    to === undefined
      ? pb.filter(`user = {:userId} && ${field} >= {:from}`, { userId, from })
      : pb.filter(`user = {:userId} && ${field} >= {:from} && ${field} <= {:to}`, { userId, from, to });
  return pb.collection(collection).getFullList<T>({ ...opts, filter, requestKey: null });
}
