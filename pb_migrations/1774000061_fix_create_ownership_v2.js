/// <reference path="../pb_data/types.d.ts" />

// Fix missing body ownership validation on createRules (v2).
// Previous attempt (1774000058) failed due to string comparison mismatch.
// This version sets the rule directly without comparing.

migrate(
  (app) => {
    const collections = [
      "nutrition_entries",
      "nutrition_goals",
      "meal_templates",
      "food_history",
      "meal_reminders",
      "push_subscriptions",
      "workout_reminders",
      "water_entries",
      "weight_entries",
      "body_photos",
      "body_measurements",
      "rest_preferences",
    ];

    const fixedRule =
      '@request.auth.id != "" && @request.body.user = @request.auth.id';

    for (const name of collections) {
      try {
        const collection = app.findCollectionByNameOrId(name);
        collection.createRule = fixedRule;
        app.save(collection);
      } catch (e) {
        // Collection may not exist in all environments
      }
    }
  },
  (app) => {
    const collections = [
      "nutrition_entries",
      "nutrition_goals",
      "meal_templates",
      "food_history",
      "meal_reminders",
      "push_subscriptions",
      "workout_reminders",
      "water_entries",
      "weight_entries",
      "body_photos",
      "body_measurements",
      "rest_preferences",
    ];

    const weakRule = '@request.auth.id != ""';

    for (const name of collections) {
      try {
        const collection = app.findCollectionByNameOrId(name);
        collection.createRule = weakRule;
        app.save(collection);
      } catch (e) {
        // Collection may not exist in all environments
      }
    }
  }
);
