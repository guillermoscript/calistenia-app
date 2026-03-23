/// <reference path="../pb_data/types.d.ts" />

// Fix missing body ownership validation on createRules.
// Before: any authenticated user could create records assigned to other users.
// After: @request.body.user must match @request.auth.id.

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
      "challenge_participants",
    ];

    const weakRule = '@request.auth.id != ""';
    const fixedRule =
      '@request.auth.id != "" && @request.body.user = @request.auth.id';

    for (const name of collections) {
      try {
        const collection = app.findCollectionByNameOrId(name);

        // Only patch collections that have the exact weak rule.
        // Collections with more specific rules (e.g. challenge_participants)
        // are left untouched.
        if (collection.createRule === weakRule) {
          collection.createRule = fixedRule;
          app.save(collection);
        }
      } catch (e) {
        console.warn(
          `[ownership-fix] skipping "${name}": ${e.message || e}`
        );
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
      "challenge_participants",
    ];

    const weakRule = '@request.auth.id != ""';
    const fixedRule =
      '@request.auth.id != "" && @request.body.user = @request.auth.id';

    for (const name of collections) {
      try {
        const collection = app.findCollectionByNameOrId(name);

        if (collection.createRule === fixedRule) {
          collection.createRule = weakRule;
          app.save(collection);
        }
      } catch (e) {
        console.warn(
          `[ownership-fix] revert skipping "${name}": ${e.message || e}`
        );
      }
    }
  }
);
