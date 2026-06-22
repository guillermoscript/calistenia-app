#!/usr/bin/env node
/**
 * Seed mock data to test the social-notifications feature end-to-end.
 *
 * Creates:
 *   - 1 phone test account: test-b@local.test  (you log in here on the device)
 *   - 3 friend accounts: ana / carlos / marco @local.test
 *   - mutual follows (test-b <-> each friend)
 *   - sessions for everyone (feed content + something to comment/react on)
 *   - real comments + reactions from friends on test-b's session
 *     -> these fire the PocketBase hooks, generating REAL notifications
 *        in test-b's inbox right now (proves the pipeline works).
 *   - friend sessions fire friend_joined / friend_workout fan-out to test-b.
 *
 * All accounts use password: TestUser123!
 *
 * Usage:
 *   node scripts/seed-social-notif-test.mjs <PB_URL> <SU_EMAIL> <SU_PASSWORD>
 * Example:
 *   node scripts/seed-social-notif-test.mjs http://127.0.0.1:8090 admin@local.test AdminLocal123!
 *
 * Idempotent for users/follows. Activity (sessions/comments/reactions) is
 * guarded by a marker so re-runs don't spam the inbox.
 */

const PB_URL = process.argv[2] || "http://127.0.0.1:8090";
const SU_EMAIL = process.argv[3] || "admin@local.test";
const SU_PASSWORD = process.argv[4] || "AdminLocal123!";
const PW = "TestUser123!";
const MARKER = "seed_social_demo"; // workout_key marker for idempotency

let TOKEN = "";
async function api(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...opts.headers,
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${path}: ${text}`), { status: res.status, json });
  return json;
}

/** Find a user by email or create it. Returns the record. */
async function upsertUser(email, name) {
  try {
    const found = await api(`/api/collections/users/records?filter=${encodeURIComponent(`email="${email}"`)}`);
    if (found.items?.length) {
      console.log(`  · user ${email} already exists (${found.items[0].id})`);
      return found.items[0];
    }
  } catch {}
  const rec = await api(`/api/collections/users/records`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PW,
      passwordConfirm: PW,
      name,
      emailVisibility: true,
      verified: true,
    }),
  });
  console.log(`  ✓ created user ${email} → ${name} (${rec.id})`);
  return rec;
}

/** Create a follow edge (follower -> following). Idempotent via unique index. */
async function follow(followerId, followingId) {
  try {
    await api(`/api/collections/follows/records`, {
      method: "POST",
      body: JSON.stringify({ follower: followerId, following: followingId }),
    });
    return true;
  } catch (e) {
    if (e.status === 400) return false; // already exists (unique index)
    throw e;
  }
}

/** Create a session for a user. Returns the record. */
async function createSession(userId, dayLabel) {
  return api(`/api/collections/sessions/records`, {
    method: "POST",
    body: JSON.stringify({
      user: userId,
      workout_key: MARKER,
      phase: 1,
      day: dayLabel,
      completed_at: new Date().toISOString(),
    }),
  });
}

async function main() {
  console.log(`🔑 Auth as superuser @ ${PB_URL}`);
  const auth = await api(`/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  });
  TOKEN = auth.token;
  console.log("  ✓ authenticated\n");

  console.log("👤 Users:");
  const me = await upsertUser("test-b@local.test", "Guille (Tú)");
  const ana = await upsertUser("ana@local.test", "Ana Torres");
  const carlos = await upsertUser("carlos@local.test", "Carlos Ruiz");
  const marco = await upsertUser("marco@local.test", "Marco Díaz");
  const friends = [ana, carlos, marco];

  console.log("\n🔗 Mutual follows (test-b <-> friends):");
  for (const f of friends) {
    const a = await follow(me.id, f.id); // test-b follows friend → test-b sees friend activity
    const b = await follow(f.id, me.id); // friend follows test-b → friend can be notified of test-b
    console.log(`  · test-b↔${f.name}: ${a ? "new" : "exists"} / ${b ? "new" : "exists"}`);
  }

  // Idempotency guard: if test-b already has a seeded session, skip activity.
  const existing = await api(
    `/api/collections/sessions/records?filter=${encodeURIComponent(`user="${me.id}" && workout_key="${MARKER}"`)}`,
  );
  if (existing.items?.length) {
    console.log("\n⏭  Activity already seeded (marker found). Skipping sessions/comments/reactions.");
    console.log("   (Delete test-b's seed sessions to re-seed.)");
    summary();
    return;
  }

  console.log("\n🏋️  Sessions for test-b (so friends can comment/react):");
  const myS1 = await createSession(me.id, "Lunes");
  await createSession(me.id, "Martes");
  console.log(`  ✓ 2 sessions for test-b (will fan-out friend_joined to friends)`);

  console.log("\n🏋️  Friend sessions (fire friend_joined / friend_workout to test-b):");
  await createSession(ana.id, "Lunes"); // Ana's 1st ever → test-b gets friend_joined
  console.log("  ✓ Ana 1 session → test-b: friend_joined");
  await createSession(carlos.id, "Lunes"); // Carlos 1st → friend_joined
  await createSession(carlos.id, "Lunes"); // Carlos 2nd same day → friend_workout
  console.log("  ✓ Carlos 2 sessions → test-b: friend_joined + friend_workout");
  await createSession(marco.id, "Lunes"); // Marco 1st → friend_joined
  console.log("  ✓ Marco 1 session → test-b: friend_joined");

  // Comments + reactions FROM friends ON test-b's session → notifies test-b.
  // Must act AS the friend (createRule requires author/reactor = auth.id),
  // so we log in as each friend.
  console.log("\n💬 Comments + reactions on test-b's session (→ test-b inbox):");
  const anaTok = (await api(`/api/collections/users/auth-with-password`, {
    method: "POST", body: JSON.stringify({ identity: "ana@local.test", password: PW }),
  })).token;
  await api(`/api/collections/comments/records`, {
    method: "POST",
    headers: { Authorization: `Bearer ${anaTok}` },
    body: JSON.stringify({ session_id: myS1.id, author: ana.id, text: "¡Crack! 🔥 Cómo subiste tan rápido?" }),
  });
  console.log("  ✓ Ana commented on test-b's session → 'comment' notif");

  const carlosTok = (await api(`/api/collections/users/auth-with-password`, {
    method: "POST", body: JSON.stringify({ identity: "carlos@local.test", password: PW }),
  })).token;
  await api(`/api/collections/feed_reactions/records`, {
    method: "POST",
    headers: { Authorization: `Bearer ${carlosTok}` },
    body: JSON.stringify({ session_id: myS1.id, reactor: carlos.id, emoji: "💪" }),
  });
  console.log("  ✓ Carlos reacted 💪 to test-b's session → 'reaction' notif");

  summary();
}

function summary() {
  console.log("\n────────────────────────────────────────────────");
  console.log("✅ Seed complete. Log in on the phone as:");
  console.log("     test-b@local.test  /  TestUser123!");
  console.log("   Friends (for the web 'other user'): ana / carlos / marco @local.test (same pw)");
  console.log("   Open the bell → you should already have notifications:");
  console.log("     • Ana comentó tu sesión");
  console.log("     • Carlos reaccionó 💪");
  console.log("     • follow notifs + friend_joined / friend_workout from friends");
  console.log("────────────────────────────────────────────────");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
