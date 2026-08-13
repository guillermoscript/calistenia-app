/// <reference path="../pb_data/types.d.ts" />

/**
 * Programas de comunidad con hitos semanales (#353).
 *
 * NOMBRES: el prefijo `community_` es obligatorio. Ya existe la familia de
 * programas de entrenamiento (`programs`, `user_programs`, `program_phases`,
 * `program_exercises`, `program_day_config`) y es OTRA cosa: currículo de
 * ejercicios por fases y días. Estas colecciones son cohortes ligeras con
 * hitos semanales. Mezclar los nombres habría hecho imposible leer el esquema.
 *
 * QUÉ SE GUARDA Y QUÉ NO:
 *   - Se guarda el CONTENIDO (programa + hitos) y la PERTENENCIA (un miembro
 *     por programa, con su día de inicio).
 *   - NO se guarda el progreso. Los hitos completados se recalculan en cada
 *     lectura desde `sessions` / `cardio_sessions`, igual que la puntuación
 *     acumulativa de retos (#352). Por eso no hace falta un índice único de
 *     "hito completado": un hito no puede completarse dos veces porque no hay
 *     ningún registro que duplicar, y editar o borrar un entreno se refleja
 *     solo en la siguiente lectura.
 *
 * PRIVACIDAD: las filas de pertenencia son estrictamente del dueño (sin
 * lectura cruzada entre miembros). Es deliberadamente más estricto que
 * `challenge_participants`: no hay ninguna pantalla que necesite ver la
 * membresía ajena, y el alcance de filas sigue abierto en #422.
 */
migrate((app) => {
  // ─── community_programs: el contenido curado ───────────────────────────────
  let programs
  try {
    programs = app.findCollectionByNameOrId('community_programs')
  } catch {
    programs = new Collection({
      name: 'community_programs',
      type: 'base',
      fields: [
        { name: 'slug', type: 'text', required: true },
        // Claves i18n, no texto: así el título sigue el idioma del usuario
        // aunque lo cambie después de apuntarse (patrón de `challenge-presets`).
        { name: 'title_key', type: 'text', required: true },
        { name: 'description_key', type: 'text', required: true },
        { name: 'duration_days', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'difficulty', type: 'text', required: true },
        { name: 'icon', type: 'text' },
        { name: 'is_published', type: 'bool' },
        { name: 'sort_order', type: 'number', onlyInt: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_community_programs_slug ON community_programs (slug)',
        'CREATE INDEX idx_community_programs_published ON community_programs (is_published, sort_order)',
      ],
    })
  }

  // Contenido curado: cualquier usuario autenticado lee lo publicado; escribir
  // es cosa de admin/editor (mismo criterio que `is_featured` en retos, #351).
  programs.listRule = '@request.auth.id != "" && is_published = true'
  programs.viewRule = '@request.auth.id != "" && is_published = true'
  programs.createRule = '@request.auth.role = "admin" || @request.auth.role = "editor"'
  programs.updateRule = '@request.auth.role = "admin" || @request.auth.role = "editor"'
  programs.deleteRule = '@request.auth.role = "admin" || @request.auth.role = "editor"'
  app.save(programs)

  // ─── community_program_milestones: los hitos semanales ─────────────────────
  let milestones
  try {
    milestones = app.findCollectionByNameOrId('community_program_milestones')
  } catch {
    milestones = new Collection({
      name: 'community_program_milestones',
      type: 'base',
      fields: [
        { name: 'program', type: 'relation', required: true, collectionId: programs.id, maxSelect: 1, cascadeDelete: true },
        // Semana 1-indexada dentro del programa. Dos hitos pueden compartirla.
        { name: 'week', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'title_key', type: 'text', required: true },
        { name: 'description_key', type: 'text' },
        // 'workout_count' | 'challenge'
        { name: 'kind', type: 'text', required: true },
        { name: 'target', type: 'number', required: true, onlyInt: true, min: 0 },
        // Solo en kind='challenge': slug del preset de retos (#350).
        { name: 'preset_key', type: 'text' },
        { name: 'sort_order', type: 'number', onlyInt: true },
      ],
      indexes: [
        'CREATE INDEX idx_community_milestones_program ON community_program_milestones (program, week, sort_order)',
      ],
    })
  }

  milestones.listRule = '@request.auth.id != "" && program.is_published = true'
  milestones.viewRule = '@request.auth.id != "" && program.is_published = true'
  milestones.createRule = '@request.auth.role = "admin" || @request.auth.role = "editor"'
  milestones.updateRule = '@request.auth.role = "admin" || @request.auth.role = "editor"'
  milestones.deleteRule = '@request.auth.role = "admin" || @request.auth.role = "editor"'
  app.save(milestones)

  // ─── community_program_members: la única fila por usuario ──────────────────
  let members
  try {
    members = app.findCollectionByNameOrId('community_program_members')
  } catch {
    members = new Collection({
      name: 'community_program_members',
      type: 'base',
      fields: [
        { name: 'program', type: 'relation', required: true, collectionId: programs.id, maxSelect: 1, cascadeDelete: true },
        { name: 'user', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: true },
        // Día de calendario en que empieza la SEMANA 1 de este miembro
        // (inscripción rodante). Sobrevive a abandonar el programa: al volver a
        // entrar se reutiliza, así que el progreso se reanuda y no se duplica.
        { name: 'started_at', type: 'date', required: true },
        // 'active' | 'left'
        { name: 'status', type: 'text', required: true },
        { name: 'left_at', type: 'date' },
      ],
      indexes: [
        // Una sola fila por (programa, usuario): dos toques o dos dispositivos
        // a la vez no pueden crear dos membresías. El cliente convierte el
        // error de índice en una unión idempotente.
        'CREATE UNIQUE INDEX idx_community_members_program_user ON community_program_members (program, "user")',
        'CREATE INDEX idx_community_members_user ON community_program_members ("user", status)',
      ],
    })
  }

  members.listRule = 'user = @request.auth.id'
  members.viewRule = 'user = @request.auth.id'
  members.createRule = '@request.auth.id != "" && @request.body.user = @request.auth.id'
  // Abandonar/reanudar solo puede tocar el estado. Dejar `started_at` editable
  // permitiría mover la ventana de puntuación a voluntad y falsear el progreso.
  members.updateRule = 'user = @request.auth.id'
    + ' && @request.body.program:isset = false'
    + ' && @request.body.user:isset = false'
    + ' && @request.body.started_at:isset = false'
  members.deleteRule = 'user = @request.auth.id'
  app.save(members)

  // ─── Semilla: «30 días de calistenia — 12 entrenos» ────────────────────────
  //
  // Va en la migración (patrón de `1775100006_seed_yoga_program.js`) para que
  // el programa exista en TODOS los entornos sin intervención manual, que es
  // uno de los criterios de aceptación del issue.
  //
  // 30 días de duración con 4 hitos semanales de 3 entrenos = 12 entrenos, que
  // es exactamente el preset `consistency_30_day` repartido por semanas. Ojo:
  // 30 no es múltiplo de 7, así que hay una 5ª ventana de 2 días SIN hito — es
  // la cola del programa y está contemplada (ver `buildWeekWindows`).
  const SEED_SLUG = '30_dias_calistenia'
  let seeded = null
  try {
    seeded = app.findFirstRecordByFilter('community_programs', `slug = "${SEED_SLUG}"`)
  } catch {
    seeded = null
  }

  if (!seeded) {
    const program = new Record(programs)
    program.set('slug', SEED_SLUG)
    program.set('title_key', 'communityProgram.30dias.title')
    program.set('description_key', 'communityProgram.30dias.description')
    program.set('duration_days', 30)
    program.set('difficulty', 'beginner')
    program.set('icon', 'calendar-check')
    program.set('is_published', true)
    program.set('sort_order', 0)
    app.save(program)

    for (let week = 1; week <= 4; week++) {
      const milestone = new Record(milestones)
      milestone.set('program', program.getString('id'))
      milestone.set('week', week)
      milestone.set('title_key', `communityProgram.30dias.week${week}.title`)
      milestone.set('description_key', `communityProgram.30dias.week${week}.description`)
      milestone.set('kind', 'workout_count')
      milestone.set('target', 3)
      milestone.set('sort_order', 0)
      app.save(milestone)
    }
  }
}, (app) => {
  for (const name of ['community_program_members', 'community_program_milestones', 'community_programs']) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch {
      // Ya no existe: revertir dos veces no debe fallar.
    }
  }
})
