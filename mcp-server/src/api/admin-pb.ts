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
    console.error(`[admin-pb] missing credentials: email=${email ? "set" : "MISSING"}, password=${password ? "set" : "MISSING"}`);
    throw new Error("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD are required");
  }

  console.log(`[admin-pb] authenticating as superuser at ${pbUrl}`);
  const pb = new PocketBase(pbUrl);
  try {
    await pb.collection("_superusers").authWithPassword(email, password);
  } catch (e: any) {
    console.error(`[admin-pb] auth failed: ${e.message || e} (url=${pbUrl}, email=${email})`);
    throw e;
  }
  _adminPB = pb;
  return pb;
}
