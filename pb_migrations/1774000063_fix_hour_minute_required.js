/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Fix meal_reminders: hour and minute with required=true reject value 0
  const meals = app.findCollectionByNameOrId("pbc_4000000017")
  const mealHour = meals.fields.getById("number_mr_hour")
  if (mealHour) { mealHour.required = false }
  const mealMinute = meals.fields.getById("number_mr_minute")
  if (mealMinute) { mealMinute.required = false }
  app.save(meals)

  // Fix workout_reminders: same issue
  const workouts = app.findCollectionByNameOrId("pbc_workout_rem")
  const workoutHour = workouts.fields.getById("number_wr_hour")
  if (workoutHour) { workoutHour.required = false }
  const workoutMinute = workouts.fields.getById("number_wr_minute")
  if (workoutMinute) { workoutMinute.required = false }
  app.save(workouts)
}, (app) => {
  const meals = app.findCollectionByNameOrId("pbc_4000000017")
  const mealHour = meals.fields.getById("number_mr_hour")
  if (mealHour) { mealHour.required = true }
  const mealMinute = meals.fields.getById("number_mr_minute")
  if (mealMinute) { mealMinute.required = true }
  app.save(meals)

  const workouts = app.findCollectionByNameOrId("pbc_workout_rem")
  const workoutHour = workouts.fields.getById("number_wr_hour")
  if (workoutHour) { workoutHour.required = true }
  const workoutMinute = workouts.fields.getById("number_wr_minute")
  if (workoutMinute) { workoutMinute.required = true }
  app.save(workouts)
})
