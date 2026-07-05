/// <reference path="../pb_data/types.d.ts" />

/**
 * pantry_items + pantry_events — Despensa inteligente F1 (issue #170, épica #153)
 *
 * pantry_items: inventario del usuario (cantidad/unidad/precio/vencimiento estimado).
 * pantry_events: ledger append-only. `pantry_items.quantity` NUNCA se edita sin crear
 * el evento correspondiente — el ledger es la fuente de historial y de atribución
 * de costos (F5).
 *
 * category es text (no select) a propósito: el enum lo garantiza el parser Zod;
 * text evita una migración si se agregan categorías.
 * quantity/delta_qty NO son required: PB trata 0 como blank en number required
 * (ver migración 1774378013).
 */
migrate((app) => {
  // ── pantry_items ──────────────────────────────────────────────────────────
  try {
    app.findCollectionByNameOrId("pantry_items")
  } catch (e) {
    const items = new Collection({
      "createRule": "@request.auth.id != \"\"",
      "deleteRule": "user = @request.auth.id",
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "updateRule": "user = @request.auth.id",
      "name": "pantry_items",
      "system": false,
      "type": "base",
      "id": "pbc_pantry_items",
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
          "id": "relation_pi_user",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "user",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_pi_name",
          "max": 120,
          "min": 0,
          "name": "name",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_pi_name_norm",
          "max": 120,
          "min": 0,
          "name": "name_normalized",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_pi_category",
          "max": 30,
          "min": 0,
          "name": "category",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "number_pi_quantity",
          "max": null,
          "min": null,
          "name": "quantity",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "select_pi_unit",
          "maxSelect": 1,
          "name": "unit",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": ["g", "kg", "ml", "l", "unidad", "paquete"]
        },
        {
          "hidden": false,
          "id": "number_pi_price_total",
          "max": null,
          "min": null,
          "name": "price_total",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_pi_currency",
          "max": 10,
          "min": 0,
          "name": "currency",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "select_pi_price_source",
          "maxSelect": 1,
          "name": "price_source",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": ["real", "estimada"]
        },
        {
          "hidden": false,
          "id": "date_pi_purchase",
          "max": "",
          "min": "",
          "name": "purchase_date",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "date"
        },
        {
          "hidden": false,
          "id": "date_pi_expiry",
          "max": "",
          "min": "",
          "name": "expiry_estimate",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "date"
        },
        {
          "hidden": false,
          "id": "select_pi_confidence",
          "maxSelect": 1,
          "name": "confidence",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": ["high", "med", "low"]
        },
        {
          "hidden": false,
          "id": "select_pi_status",
          "maxSelect": 1,
          "name": "status",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": ["active", "depleted", "discarded"]
        },
        {
          "hidden": false,
          "id": "select_pi_source",
          "maxSelect": 1,
          "name": "source",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": ["chat", "receipt", "shopping", "manual"]
        },
        {
          "hidden": false,
          "id": "autodate_pi_created",
          "name": "created",
          "onCreate": true,
          "onUpdate": false,
          "presentable": false,
          "system": false,
          "type": "autodate"
        },
        {
          "hidden": false,
          "id": "autodate_pi_updated",
          "name": "updated",
          "onCreate": true,
          "onUpdate": true,
          "presentable": false,
          "system": false,
          "type": "autodate"
        }
      ],
      "indexes": [
        "CREATE INDEX idx_pi_user_status ON pantry_items (user, status)",
        "CREATE INDEX idx_pi_user_name ON pantry_items (user, name_normalized)"
      ]
    })
    app.save(items)
  }

  // ── pantry_events ─────────────────────────────────────────────────────────
  try {
    app.findCollectionByNameOrId("pantry_events")
  } catch (e) {
    const nutritionEntries = app.findCollectionByNameOrId("nutrition_entries")
    const events = new Collection({
      "createRule": "@request.auth.id != \"\"",
      "deleteRule": "user = @request.auth.id",
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "updateRule": "user = @request.auth.id",
      "name": "pantry_events",
      "system": false,
      "type": "base",
      "id": "pbc_pantry_events",
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
          "id": "relation_pe_user",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "user",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "cascadeDelete": true,
          "collectionId": "pbc_pantry_items",
          "hidden": false,
          "id": "relation_pe_item",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "item",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "hidden": false,
          "id": "select_pe_type",
          "maxSelect": 1,
          "name": "type",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "select",
          "values": ["add", "consume", "adjust", "discard"]
        },
        {
          "hidden": false,
          "id": "number_pe_delta",
          "max": null,
          "min": null,
          "name": "delta_qty",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "cascadeDelete": false,
          "collectionId": nutritionEntries.id,
          "hidden": false,
          "id": "relation_pe_entry",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "linked_entry",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "relation"
        },
        {
          "hidden": false,
          "id": "autodate_pe_created",
          "name": "created",
          "onCreate": true,
          "onUpdate": false,
          "presentable": false,
          "system": false,
          "type": "autodate"
        }
      ],
      "indexes": [
        "CREATE INDEX idx_pe_user ON pantry_events (user)",
        "CREATE INDEX idx_pe_item ON pantry_events (item)"
      ]
    })
    app.save(events)
  }
}, (app) => {
  // events primero: tiene relación a items
  for (const name of ["pantry_events", "pantry_items"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch (e) {
      // Already deleted, ignore
    }
  }
})
