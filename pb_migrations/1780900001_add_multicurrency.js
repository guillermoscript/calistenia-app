/// <reference path="../pb_data/types.d.ts" />

/**
 * Multimoneda con USD de referencia (F5 #174).
 * price_total pasa a ser SIEMPRE USD (moneda funcional). La factura conserva
 * su moneda: price_original + currency_original (código canónico VES/EUR/USD)
 * + exchange_rate (unidades por 1 USD AL MOMENTO de la compra — con
 * hiperinflación la tasa de hoy sobre una compra vieja miente).
 * users: default_currency (moneda en la que habla el user en el chat) +
 * currency_rates (última tasa usada por moneda, ej {"VES":143.5}).
 * Sin backfill: todo lo previo fue USD de facto (price_original null = nació USD).
 */
migrate((app) => {
  const items = app.findCollectionByNameOrId("pantry_items")

  if (!items.fields.find(f => f.name === "price_original")) {
    items.fields.add(new Field({
      "hidden": false,
      "id": "number_pi_price_original",
      "max": null,
      "min": null,
      "name": "price_original",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }
  if (!items.fields.find(f => f.name === "currency_original")) {
    items.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_pi_currency_original",
      "max": 10,
      "min": 0,
      "name": "currency_original",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }
  if (!items.fields.find(f => f.name === "exchange_rate")) {
    items.fields.add(new Field({
      "hidden": false,
      "id": "number_pi_exchange_rate",
      "max": null,
      "min": null,
      "name": "exchange_rate",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }
  app.save(items)

  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  if (!users.fields.find(f => f.name === "default_currency")) {
    users.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_user_default_currency",
      "max": 10,
      "min": 0,
      "name": "default_currency",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }
  if (!users.fields.find(f => f.name === "currency_rates")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "json_user_currency_rates",
      "maxSize": 2000,
      "name": "currency_rates",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }
  app.save(users)
}, (app) => {
  try {
    const items = app.findCollectionByNameOrId("pantry_items")
    items.fields = items.fields.filter(f =>
      !["number_pi_price_original", "text_pi_currency_original", "number_pi_exchange_rate"].includes(f.id))
    app.save(items)
  } catch (e) { /* ignore */ }
  try {
    const users = app.findCollectionByNameOrId("_pb_users_auth_")
    users.fields = users.fields.filter(f =>
      !["text_user_default_currency", "json_user_currency_rates"].includes(f.id))
    app.save(users)
  } catch (e) { /* ignore */ }
})
