/// <reference path="../pb_data/types.d.ts" />

/**
 * Limpieza de los campos PII `hidden` de `users` (#247, seguimiento de GHSA-wwj3-9h95-wcpf).
 *
 * Los 4 campos que 1780500001 marcó `hidden` ya viven en colecciones
 * protegidas per-user y no les queda ningún consumidor:
 *  - `age`/`sex`             → `nutrition_goals` (#243, PR #245)
 *  - `medical_conditions`/`injuries` → `user_health` (#247, PR #249, con backfill)
 *
 * Antes de borrar, backfill defensivo de `age`/`sex` a las filas existentes de
 * `nutrition_goals` que los tengan vacíos (usuarios pre-GHSA que crearon su
 * objetivo antes de #245). Usuarios sin fila de `nutrition_goals` no tienen
 * dónde recibirlos: el wizard los pide al crear el objetivo, así que ese dato
 * (hoy inaccesible para el propio usuario) se pierde con el borrado.
 *
 * `blocked_users` también es `hidden` pero es intencional (gestión server-side
 * vía hooks; feature de bloqueo) — NO se toca.
 *
 * El down solo restaura el esquema (campos `hidden` vacíos), no los datos.
 */
migrate((app) => {
  // — Backfill age/sex → nutrition_goals —
  const pageSize = 500
  for (let page = 0; ; page++) {
    const users = app.findRecordsByFilter("users", "id != ''", "", pageSize, page * pageSize)
    if (!users.length) break
    for (const u of users) {
      const age = u.get("age")
      const sex = u.getString("sex")
      if (!age && !sex) continue
      const goals = app.findRecordsByFilter("nutrition_goals", `user = '${u.id}'`, "", 50, 0)
      for (const g of goals) {
        let dirty = false
        if (age && !g.get("age")) { g.set("age", age); dirty = true }
        if (sex && !g.getString("sex")) { g.set("sex", sex); dirty = true }
        if (dirty) app.save(g)
      }
    }
    if (users.length < pageSize) break
  }

  // — Borrado de los 4 campos hidden —
  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  const dropIds = ["json_user_medical_conditions", "json_user_injuries", "number_user_age", "text_user_sex"]
  users.fields = users.fields.filter(f => !dropIds.includes(f.id))
  app.save(users)
}, (app) => {
  // Restaura el esquema post-1780500001 (hidden), sin datos.
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  if (!users.fields.find(f => f.name === "medical_conditions")) {
    users.fields.add(new Field({
      "hidden": true, "id": "json_user_medical_conditions", "maxSize": 2000,
      "name": "medical_conditions", "presentable": false, "required": false,
      "system": false, "type": "json",
    }))
  }
  if (!users.fields.find(f => f.name === "injuries")) {
    users.fields.add(new Field({
      "hidden": true, "id": "json_user_injuries", "maxSize": 2000,
      "name": "injuries", "presentable": false, "required": false,
      "system": false, "type": "json",
    }))
  }
  if (!users.fields.find(f => f.name === "age")) {
    users.fields.add(new Field({
      "hidden": true, "id": "number_user_age", "max": 120, "min": 13,
      "name": "age", "onlyInt": true, "presentable": false, "required": false,
      "system": false, "type": "number",
    }))
  }
  if (!users.fields.find(f => f.name === "sex")) {
    users.fields.add(new Field({
      "hidden": true, "id": "text_user_sex", "max": 0, "min": 0,
      "name": "sex", "pattern": "", "presentable": false, "required": false,
      "system": false, "type": "text",
    }))
  }

  app.save(users)
})
