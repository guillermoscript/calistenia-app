/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const goals = app.findCollectionByNameOrId("nutrition_goals")

  // Origen del objetivo: 'auto' (derivado de la fórmula) vs 'manual' (editado por
  // el usuario). Permite recalcular al cambiar de objetivo sin pisar overrides
  // manuales. Filas existentes se tratan como 'manual' a nivel de app (#243).
  if (!goals.fields.find(f => f.name === "source")) {
    goals.fields.add(new Field({
      "hidden": false,
      "id": "select_nutrition_goals_source",
      "maxSelect": 1,
      "name": "source",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["auto", "manual"]
    }))
  }

  app.save(goals)
}, (app) => {
  try {
    const goals = app.findCollectionByNameOrId("nutrition_goals")
    goals.fields = goals.fields.filter(f => f.id !== "select_nutrition_goals_source")
    app.save(goals)
  } catch (e) {}
})
