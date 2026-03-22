/// <reference path="../pb_data/types.d.ts" />

/**
 * Add created/updated autodate fields to referrals and point_transactions.
 * These were missing from the original migrations.
 */
migrate((app) => {
  // Fix referrals
  const referrals = app.findCollectionByNameOrId("referrals")
  referrals.fields.push(new Field({
    "hidden": false,
    "id": "autodate_referrals_created",
    "name": "created",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))
  referrals.fields.push(new Field({
    "hidden": false,
    "id": "autodate_referrals_updated",
    "name": "updated",
    "onCreate": true,
    "onUpdate": true,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))
  app.save(referrals)

  // Fix point_transactions
  const transactions = app.findCollectionByNameOrId("point_transactions")
  transactions.fields.push(new Field({
    "hidden": false,
    "id": "autodate_transactions_created",
    "name": "created",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))
  transactions.fields.push(new Field({
    "hidden": false,
    "id": "autodate_transactions_updated",
    "name": "updated",
    "onCreate": true,
    "onUpdate": true,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))
  app.save(transactions)
}, (app) => {
  // Remove autodate fields
  const referrals = app.findCollectionByNameOrId("referrals")
  referrals.fields = referrals.fields.filter(f =>
    !["autodate_referrals_created", "autodate_referrals_updated"].includes(f.id)
  )
  app.save(referrals)

  const transactions = app.findCollectionByNameOrId("point_transactions")
  transactions.fields = transactions.fields.filter(f =>
    !["autodate_transactions_created", "autodate_transactions_updated"].includes(f.id)
  )
  app.save(transactions)
})
