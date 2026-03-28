/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\" && (@request.auth.role = \"admin\" || @request.auth.role = \"editor\")",
    "deleteRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
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
        "hidden": false,
        "id": "json8010000001",
        "maxSize": 0,
        "name": "title",
        "presentable": true,
        "required": true,
        "system": false,
        "type": "json"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text8010000002",
        "max": 200,
        "min": 1,
        "name": "slug_es",
        "pattern": "^[a-z0-9-]+$",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text8010000003",
        "max": 200,
        "min": 1,
        "name": "slug_en",
        "pattern": "^[a-z0-9-]+$",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "json8010000004",
        "maxSize": 0,
        "name": "excerpt",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json8010000005",
        "maxSize": 0,
        "name": "body",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "file8010000006",
        "maxSelect": 1,
        "maxSize": 5242880,
        "mimeTypes": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "name": "cover_image",
        "presentable": false,
        "required": false,
        "system": false,
        "thumbs": ["800x450", "400x225"],
        "type": "file"
      },
      {
        "hidden": false,
        "id": "select8010000007",
        "maxSelect": 1,
        "name": "category",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "calistenia",
          "tutoriales",
          "nutricion",
          "consejos",
          "actualizaciones"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text8010000008",
        "max": 100,
        "min": 0,
        "name": "author_name",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "file8010000009",
        "maxSelect": 1,
        "maxSize": 2097152,
        "mimeTypes": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "name": "author_avatar",
        "presentable": false,
        "required": false,
        "system": false,
        "thumbs": ["100x100"],
        "type": "file"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text8010000010",
        "max": 100,
        "min": 0,
        "name": "author_instagram",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select8010000011",
        "maxSelect": 1,
        "name": "status",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "draft",
          "published"
        ]
      },
      {
        "hidden": false,
        "id": "date8010000012",
        "max": "",
        "min": "",
        "name": "published_at",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "json8010000013",
        "maxSize": 0,
        "name": "seo_title",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json8010000014",
        "maxSize": 0,
        "name": "seo_description",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      }
    ],
    "id": "pbc_8010000001",
    "indexes": [
      "CREATE UNIQUE INDEX idx_blog_slug_es ON blog_posts (slug_es)",
      "CREATE UNIQUE INDEX idx_blog_slug_en ON blog_posts (slug_en)",
      "CREATE INDEX idx_blog_status ON blog_posts (status)",
      "CREATE INDEX idx_blog_category ON blog_posts (category)",
      "CREATE INDEX idx_blog_published ON blog_posts (published_at)"
    ],
    "listRule": "status = \"published\"",
    "name": "blog_posts",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id != \"\" && (@request.auth.role = \"admin\" || @request.auth.role = \"editor\")",
    "viewRule": "status = \"published\""
  });

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_8010000001");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
