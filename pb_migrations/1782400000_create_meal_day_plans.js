/// <reference path="../pb_data/types.d.ts" />
/**
 * Planes de UN día, persistidos y sincronizados entre web y móvil.
 *
 * Por qué una colección nueva y no ensanchar `weekly_meal_plans`: ese esquema
 * asume "una fila activa por usuario" y `fetchActivePlan` la lee con
 * getFirstListItem. Si metiéramos ahí los planes de día, un cliente viejo
 * (móvil, que pasa por revisión de Play mientras la web ya desplegó) tomaría
 * la fila equivocada como plan activo y el plan semanal parecería haberse
 * borrado. Colección aparte ⇒ la semántica de weekly_meal_plans no cambia ni
 * un byte y no hay ventana de medio-despliegue.
 *
 * Escrita por el CLIENTE (los planes de día son respuestas síncronas del AI
 * API), así que la createRule exige que el `user` del body sea el propio desde
 * el minuto cero — no repetimos el agujero cross-user que corrigió
 * 1781600000_harden_create_rules_per_user.
 *
 * Migración ADD-ONLY: no toca ninguna colección existente.
 */
migrate((app) => {
  // Idempotente: si ya existe (migración parcial previa), no hacer nada.
  try { app.findCollectionByNameOrId("pbc_mdp0000001"); return } catch (_) {}

  const collection = new Collection({
    "createRule": "@request.auth.id != \"\" && @request.body.user = @request.auth.id",
    "deleteRule": "user = @request.auth.id",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation_mdp_user",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "user",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "date_mdp_target_date",
        "max": "",
        "min": "",
        "name": "target_date",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        // Con qué se generó: 'pantry' = solo lo que el usuario ya tiene,
        // 'buy' = libre, etiquetando qué hay que comprar.
        "hidden": false,
        "id": "select_mdp_source",
        "maxSelect": 1,
        "name": "source",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "pantry",
          "buy"
        ]
      },
      {
        // Qué representa goal_snapshot: el día entero ('full') o lo que le
        // quedaba al usuario cuando pidió el plan ('remaining'). Sin este
        // campo no se puede releer un plan viejo sin adivinar.
        "hidden": false,
        "id": "select_mdp_macro_basis",
        "maxSelect": 1,
        "name": "macro_basis",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "full",
          "remaining"
        ]
      },
      {
        "hidden": false,
        "id": "select_mdp_status",
        "maxSelect": 1,
        "name": "status",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "active",
          "archived"
        ]
      },
      {
        "hidden": false,
        "id": "json_mdp_goal_snapshot",
        "maxSize": 0,
        "name": "goal_snapshot",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json_mdp_pantry_snapshot",
        "maxSize": 0,
        "name": "pantry_snapshot",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json_mdp_meals",
        "maxSize": 0,
        "name": "meals",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "json"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_mdp_notes",
        "max": 0,
        "min": 0,
        "name": "notes",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_mdp_ai_model",
        "max": 0,
        "min": 0,
        "name": "ai_model",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      }
    ],
    "id": "pbc_mdp0000001",
    // Sin índice UNIQUE por (user, target_date): regenerar archiva la fila
    // vieja y crea la nueva, y un unique haría fallar la creación si el
    // archivado no terminó primero.
    "indexes": [
      "CREATE INDEX idx_mdp_user_date ON meal_day_plans (user, target_date)",
      "CREATE INDEX idx_mdp_user_status ON meal_day_plans (user, status)"
    ],
    "listRule": "user = @request.auth.id",
    "name": "meal_day_plans",
    "system": false,
    "type": "base",
    "updateRule": "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)",
    "viewRule": "user = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_mdp0000001");
    return app.delete(collection);
  } catch (e) {
    // Ya borrada, ignorar
  }
})
