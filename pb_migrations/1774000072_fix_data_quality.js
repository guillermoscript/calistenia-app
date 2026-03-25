/// <reference path="../pb_data/types.d.ts" />

/**
 * Data quality fixes:
 * 1. challenge_participants — add ownership validation on create
 * 2. nutrition_entries.logged_at — autodate → date (allow backdating)
 * 3. water_entries.logged_at — autodate → date (allow backdating)
 * 4. cardio_sessions.started_at/finished_at — text → date
 * 5. challenges.starts_at/ends_at — text → date
 * 6. lumbar_checks.date — text → date
 * 7. lumbar_checks.updateRule — add user:isset check
 * 8. user_programs — add UNIQUE index (user, program)
 */
migrate(
  (app) => {
    // ── 1. challenge_participants: fix create ownership ──────────────
    const cp = app.findCollectionByNameOrId("challenge_participants");
    cp.createRule =
      '@request.auth.id != "" && @request.body.user = @request.auth.id';
    app.save(cp);

    // ── 2. nutrition_entries: logged_at autodate → date ──────────────
    const ne = app.findCollectionByNameOrId("pbc_4000000004");
    const neLoggedAt = ne.fields.getByName("logged_at");
    neLoggedAt.type = "date";
    // Remove autodate props
    delete neLoggedAt.onCreate;
    delete neLoggedAt.onUpdate;
    neLoggedAt.required = true;
    app.save(ne);

    // ── 3. water_entries: logged_at autodate → date ─────────────────
    const we = app.findCollectionByNameOrId("pbc_water_001");
    const weLoggedAt = we.fields.getByName("logged_at");
    weLoggedAt.type = "date";
    delete weLoggedAt.onCreate;
    delete weLoggedAt.onUpdate;
    weLoggedAt.required = true;
    app.save(we);

    // ── 4. cardio_sessions: started_at/finished_at text → date ──────
    const cs = app.findCollectionByNameOrId("cardio_sessions");
    const csStarted = cs.fields.getByName("started_at");
    csStarted.type = "date";
    const csFinished = cs.fields.getByName("finished_at");
    csFinished.type = "date";
    app.save(cs);

    // ── 5. challenges: starts_at/ends_at text → date ────────────────
    const ch = app.findCollectionByNameOrId("challenges");
    const chStarts = ch.fields.getByName("starts_at");
    chStarts.type = "date";
    const chEnds = ch.fields.getByName("ends_at");
    chEnds.type = "date";
    app.save(ch);

    // ── 6. lumbar_checks: date text → date ──────────────────────────
    const lc = app.findCollectionByNameOrId("pbc_3725384270");
    const lcDate = lc.fields.getByName("date");
    lcDate.type = "date";
    lcDate.required = true;
    // ── 7. lumbar_checks: harden updateRule ──────────────────────────
    lc.updateRule =
      'user = @request.auth.id && @request.body.user:isset = false';
    app.save(lc);

    // ── 8. user_programs: dedupe then add UNIQUE index (user, program)
    // Remove duplicate (user, program) rows, keeping the oldest one
    app.db().newQuery(`
      DELETE FROM user_programs
      WHERE id NOT IN (
        SELECT MIN(id) FROM user_programs GROUP BY user, program
      )
    `).execute();

    const up = app.findCollectionByNameOrId("pbc_4176526388");
    up.indexes = up.indexes || [];
    const uniqueIdx =
      "CREATE UNIQUE INDEX idx_user_programs_pair ON user_programs (user, program)";
    if (!up.indexes.includes(uniqueIdx)) {
      up.indexes.push(uniqueIdx);
    }
    app.save(up);
  },
  (app) => {
    // Revert 1: challenge_participants
    const cp = app.findCollectionByNameOrId("challenge_participants");
    cp.createRule = '@request.auth.id != ""';
    app.save(cp);

    // Revert 2: nutrition_entries logged_at back to autodate
    const ne = app.findCollectionByNameOrId("pbc_4000000004");
    const neLoggedAt = ne.fields.getByName("logged_at");
    neLoggedAt.type = "autodate";
    neLoggedAt.onCreate = true;
    neLoggedAt.onUpdate = false;
    delete neLoggedAt.required;
    app.save(ne);

    // Revert 3: water_entries logged_at back to autodate
    const we = app.findCollectionByNameOrId("pbc_water_001");
    const weLoggedAt = we.fields.getByName("logged_at");
    weLoggedAt.type = "autodate";
    weLoggedAt.onCreate = true;
    weLoggedAt.onUpdate = false;
    delete weLoggedAt.required;
    app.save(we);

    // Revert 4: cardio_sessions back to text
    const cs = app.findCollectionByNameOrId("cardio_sessions");
    const csStarted = cs.fields.getByName("started_at");
    csStarted.type = "text";
    const csFinished = cs.fields.getByName("finished_at");
    csFinished.type = "text";
    app.save(cs);

    // Revert 5: challenges back to text
    const ch = app.findCollectionByNameOrId("challenges");
    const chStarts = ch.fields.getByName("starts_at");
    chStarts.type = "text";
    const chEnds = ch.fields.getByName("ends_at");
    chEnds.type = "text";
    app.save(ch);

    // Revert 6+7: lumbar_checks back to text + original updateRule
    const lc = app.findCollectionByNameOrId("pbc_3725384270");
    const lcDate = lc.fields.getByName("date");
    lcDate.type = "text";
    lc.updateRule = "user = @request.auth.id";
    app.save(lc);

    // Revert 8: remove unique index
    const up = app.findCollectionByNameOrId("pbc_4176526388");
    up.indexes = (up.indexes || []).filter(
      (idx) => !idx.includes("idx_user_programs_pair")
    );
    app.save(up);
  }
);
