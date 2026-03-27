import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

async function main() {
  try {
    // Authenticate as the newly created superuser
    await pb.admins.authWithPassword('bot@example.com', 'bot123456');
    console.log("Logged in as superuser!");

    const views = [
      {
        name: "view_nutrition_daily",
        type: "view",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        options: {
          query: `
            SELECT
              MIN(n.id) as id,
              n.user,
              DATE(n.logged_at) as log_date,
              SUM(n.total_calories) as total_calories,
              SUM(n.total_protein) as total_protein,
              SUM(n.total_carbs) as total_carbs,
              SUM(n.total_fat) as total_fat
            FROM nutrition_entries n
            GROUP BY n.user, DATE(n.logged_at)
          `
        }
      },
      {
        name: "view_session_stats",
        type: "view",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        options: {
          query: `
            SELECT 
              s.id as id,
              s.user,
              s.workout_key,
              s.completed_at,
              COUNT(sl.id) as total_sets,
              SUM(sl.reps) as total_reps,
              SUM(sl.weight_kg) as total_weight_lifted
            FROM sessions s
            LEFT JOIN sets_log sl ON sl.user = s.user AND sl.workout_key = s.workout_key
            GROUP BY s.id
          `
        }
      },
      {
        name: "view_exercise_prs",
        type: "view",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        options: {
          query: `
            SELECT
              MIN(sl.id) as id,
              sl.user,
              sl.exercise_id,
              MAX(sl.weight_kg) as max_weight,
              MAX(sl.reps) as max_reps,
              COUNT(sl.id) as total_sets_performed
            FROM sets_log sl
            GROUP BY sl.user, sl.exercise_id
          `
        }
      },
      {
        name: "view_leaderboard",
        type: "view",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        options: {
          query: `
            SELECT 
              u.id as id,
              u.id as user,
              u.display_name,
              u.avatar,
              st.xp,
              st.level,
              st.workout_streak_current,
              st.total_sessions
            FROM users u
            LEFT JOIN user_stats st ON st.user = u.id
            WHERE st.id IS NOT NULL
          `
        }
      },
      {
        name: "view_water_daily",
        type: "view",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        options: {
          query: `
            SELECT
              MIN(id) as id,
              user,
              DATE(logged_at) as log_date,
              SUM(amount_ml) as total_amount_ml,
              COUNT(id) as times_logged
            FROM water_entries
            GROUP BY user, DATE(logged_at)
          `
        }
      }
    ];

    for (const view of views) {
      try {
        // Create collection
        await pb.collections.create(view);
        console.log(`Created view: ${view.name}`);
      } catch (e) {
        if (e.status === 400 && e.data?.data?.name?.code === 'validation_invalid_name') {
           console.log(`View ${view.name} might already exist or invalid name.`);
        } else {
           console.log(`Error creating ${view.name}:`, JSON.stringify(e.data, null, 2));
           // Try updating if it already exists
           try {
             const existing = await pb.collections.getFirstListItem(`name="${view.name}"`);
             await pb.collections.update(existing.id, view);
             console.log(`Updated existing view: ${view.name}`);
           } catch(updateErr) {
             // ignore
           }
        }
      }
    }

  } catch (e) {
    console.error("Auth error:", e);
  }
}
main();
