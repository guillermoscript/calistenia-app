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

  const pb = new PocketBase(config.pocketbaseUrl);
  await pb.collection("_superusers").authWithPassword(
    process.env.PB_SUPERUSER_EMAIL ?? "",
    process.env.PB_SUPERUSER_PASSWORD ?? ""
  );
  _adminPB = pb;
  return pb;
}
