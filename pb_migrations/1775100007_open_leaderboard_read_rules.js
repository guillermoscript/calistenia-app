/// <reference path="../pb_data/types.d.ts" />
// Open read rules so the leaderboard can fetch stats, settings (PRs), and
// session counts for followed users — not just the current user.
migrate((app) => {
  // ── user_stats: allow any authenticated user to list/view ──────────────
  const userStats = app.findCollectionByNameOrId("user_stats");
  userStats.listRule = "@request.auth.id != \"\"";
  userStats.viewRule = "@request.auth.id != \"\"";
  app.save(userStats);

  // ── settings: allow any authenticated user to list/view ────────────────
  // (contains PR values used in the leaderboard)
  const settings = app.findCollectionByNameOrId("settings");
  settings.listRule = "@request.auth.id != \"\"";
  settings.viewRule = "@request.auth.id != \"\"";
  app.save(settings);

  // ── sessions: allow any authenticated user to list/view ────────────────
  // (leaderboard counts sessions per week/month for followed users)
  const sessions = app.findCollectionByNameOrId("sessions");
  sessions.listRule = "@request.auth.id != \"\"";
  sessions.viewRule = "@request.auth.id != \"\"";
  app.save(sessions);
}, (app) => {
  // Revert to owner-only read rules
  const userStats = app.findCollectionByNameOrId("user_stats");
  userStats.listRule = "user = @request.auth.id";
  userStats.viewRule = "user = @request.auth.id";
  app.save(userStats);

  const settings = app.findCollectionByNameOrId("settings");
  settings.listRule = "user = @request.auth.id";
  settings.viewRule = "user = @request.auth.id";
  app.save(settings);

  const sessions = app.findCollectionByNameOrId("sessions");
  sessions.listRule = "user = @request.auth.id";
  sessions.viewRule = "user = @request.auth.id";
  app.save(sessions);
});
