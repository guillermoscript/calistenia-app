/// <reference path="../pb_data/types.d.ts" />

/**
 * Create food_categories and food_tags collections.
 * These are referenced by useFoodCatalog.ts but were never created.
 */
migrate(
  (app) => {
    // ── food_categories ─────────────────────────────────────────────
    let categories;
    try {
      categories = app.findCollectionByNameOrId("food_categories");
    } catch {
      categories = new Collection({
        name: "food_categories",
        type: "base",
        fields: [
          {
            autogeneratePattern: "[a-z0-9]{15}",
            hidden: false,
            id: "text3208210256",
            max: 15,
            min: 15,
            name: "id",
            pattern: "^[a-z0-9]+$",
            presentable: false,
            primaryKey: true,
            required: true,
            system: true,
            type: "text",
          },
          {
            name: "slug",
            type: "text",
            required: true,
          },
          {
            name: "name",
            type: "text",
            required: true,
          },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_food_categories_slug ON food_categories (slug)",
        ],
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: null,
        deleteRule: null,
      });
    }
    app.save(categories);

    // ── food_tags ───────────────────────────────────────────────────
    let tags;
    try {
      tags = app.findCollectionByNameOrId("food_tags");
    } catch {
      tags = new Collection({
        name: "food_tags",
        type: "base",
        fields: [
          {
            autogeneratePattern: "[a-z0-9]{15}",
            hidden: false,
            id: "text3208210256",
            max: 15,
            min: 15,
            name: "id",
            pattern: "^[a-z0-9]+$",
            presentable: false,
            primaryKey: true,
            required: true,
            system: true,
            type: "text",
          },
          {
            name: "slug",
            type: "text",
            required: true,
          },
          {
            name: "name",
            type: "text",
            required: true,
          },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_food_tags_slug ON food_tags (slug)",
        ],
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: null,
        deleteRule: null,
      });
    }
    app.save(tags);

    // ── Add category + tags relation fields to foods collection ─────
    try {
      const foods = app.findCollectionByNameOrId("foods");

      // Add category relation if missing
      if (!foods.fields.getByName("category")) {
        foods.fields.add(
          new Field({
            name: "category",
            type: "relation",
            collectionId: categories.id,
            maxSelect: 1,
            required: false,
          })
        );
      }

      // Add tags relation if missing
      if (!foods.fields.getByName("tags")) {
        foods.fields.add(
          new Field({
            name: "tags",
            type: "relation",
            collectionId: tags.id,
            maxSelect: 50,
            required: false,
          })
        );
      }

      app.save(foods);
    } catch {
      // foods collection doesn't exist — skip relation wiring
    }
  },
  (app) => {
    // Revert: remove relation fields from foods, then delete collections
    try {
      const foods = app.findCollectionByNameOrId("foods");
      const catField = foods.fields.getByName("category");
      if (catField) foods.fields.removeById(catField.id);
      const tagField = foods.fields.getByName("tags");
      if (tagField) foods.fields.removeById(tagField.id);
      app.save(foods);
    } catch {
      // ignore
    }

    try {
      const tags = app.findCollectionByNameOrId("food_tags");
      app.delete(tags);
    } catch {
      // ignore
    }

    try {
      const categories = app.findCollectionByNameOrId("food_categories");
      app.delete(categories);
    } catch {
      // ignore
    }
  }
);
