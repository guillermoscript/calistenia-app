/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("exercises_catalog");
    // Allow authenticated users to create and update exercises in the catalog
    col.createRule = '@request.auth.id != ""';
    col.updateRule = '@request.auth.id != ""';
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("exercises_catalog");
    col.createRule = null;
    col.updateRule = null;
    app.save(col);
  }
);
