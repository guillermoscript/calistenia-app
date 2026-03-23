/**
 * Superuser PocketBase client — cached singleton.
 *
 * Used ONLY for server-side internal operations (push notifications,
 * job processing) that need to read across users. Never exposed to
 * client requests.
 *
 * Requires PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD env vars.
 */

import PocketBase from "pocketbase";
import config from "./config.js";

let _adminPB: PocketBase | null = null;

export async function getAdminPB(): Promise<PocketBase> {
  if (_adminPB?.authStore.isValid) return _adminPB;

  const email = process.env.PB_SUPERUSER_EMAIL ?? "";
  const password = process.env.PB_SUPERUSER_PASSWORD ?? "";
  const pbUrl = config.pocketbaseUrl;

  if (!email || !password) {
    throw new Error("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD are required");
  }

  const pb = new PocketBase(pbUrl);
  await pb.collection("_superusers").authWithPassword(email, password);
  _adminPB = pb;
  return pb;
}
