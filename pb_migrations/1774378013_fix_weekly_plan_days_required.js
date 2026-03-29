/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("weekly_plan_days");

  // day_index: remove required so 0 is accepted (PB treats 0 as blank for required numbers)
  const dayIndexField = collection.fields.getByName("day_index");
  if (dayIndexField) dayIndexField.required = false;

  // meals: remove required so [] is accepted (PB treats [] as blank for required JSON)
  const mealsField = collection.fields.getByName("meals");
  if (mealsField) mealsField.required = false;

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("weekly_plan_days");

  const dayIndexField = collection.fields.getByName("day_index");
  if (dayIndexField) dayIndexField.required = true;

  const mealsField = collection.fields.getByName("meals");
  if (mealsField) mealsField.required = true;

  return app.save(collection);
});
