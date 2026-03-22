/**
 * PocketBase Migration Script — v0.21 compatible
 * Crea/actualiza las colecciones necesarias + seed del programa Calistenia 6M.
 *
 * USO:
 *   PB_SUPERUSER_EMAIL=tu@email.com PB_SUPERUSER_PASSWORD=pass node scripts/pb-migrate.js
 *   npm run pb:migrate
 */

import PocketBase from 'pocketbase'

const PB_URL = process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090'
const SUPERUSER_EMAIL = process.env.PB_SUPERUSER_EMAIL
const SUPERUSER_PASSWORD = process.env.PB_SUPERUSER_PASSWORD

if (!SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) {
  console.error('ERROR: Exporta PB_SUPERUSER_EMAIL y PB_SUPERUSER_PASSWORD antes de ejecutar.')
  process.exit(1)
}

const pb = new PocketBase(PB_URL)

const userRelationField = {
  name: 'user',
  type: 'relation',
  required: true,
  collectionId: '_pb_users_auth_',
  maxSelect: 1,
  cascadeDelete: true,
}

// ─── Seed data (mirrors src/data/workouts.js) ────────────────────────────────

const SEED_PHASES = [
  { phase_number: 1, name: 'Base & Activación',    weeks: '1-6',   color: '#c8f542', bg_color: 'rgba(200,245,66,0.08)',  sort_order: 1 },
  { phase_number: 2, name: 'Fuerza Fundamental',   weeks: '7-13',  color: '#42c8f5', bg_color: 'rgba(66,200,245,0.08)',  sort_order: 2 },
  { phase_number: 3, name: 'Intensidad & Skills',  weeks: '14-20', color: '#f542c8', bg_color: 'rgba(245,66,200,0.08)',  sort_order: 3 },
  { phase_number: 4, name: 'Peak & Consolidación', weeks: '21-26', color: '#f5c842', bg_color: 'rgba(245,200,66,0.08)',  sort_order: 4 },
]

// day_id → { day_name, day_focus, day_type, day_color }
const DAY_META = {
  lun: { day_name: 'Lunes',      day_focus: 'Empuje + Core',      day_type: 'push',   day_color: '#c8f542' },
  mar: { day_name: 'Martes',     day_focus: 'Tirón + Movilidad',  day_type: 'pull',   day_color: '#42c8f5' },
  mie: { day_name: 'Miércoles',  day_focus: 'Lumbar + Stretching',day_type: 'lumbar', day_color: '#f54242' },
  jue: { day_name: 'Jueves',     day_focus: 'Piernas + Glúteos',  day_type: 'legs',   day_color: '#f542c8' },
  vie: { day_name: 'Viernes',    day_focus: 'Full Body + Core',   day_type: 'full',   day_color: '#f5c842' },
  sab: { day_name: 'Sábado',     day_focus: 'Caminata activa',    day_type: 'rest',   day_color: '#888899' },
  dom: { day_name: 'Domingo',    day_focus: 'Descanso total',     day_type: 'rest',   day_color: '#888899' },
}

// [phaseNumber, dayId, workoutTitle, exercises[]]
const SEED_WORKOUTS = [
  // ── FASE 1 ─────────────────────────────────────────────────────────────────
  [1, 'lun', 'Empuje + Core Lumbar', [
    { exercise_id:'bird_dog',        exercise_name:'Bird-Dog',                    sets:3, reps:'12/lado',      rest_seconds:60,  muscles:'Lumbar, core, glúteos',          note:'Espalda neutral, mantén 2s arriba. PRIORIDAD ALTA.',                      youtube:'Bird Dog exercise tutorial',                        priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'hollow_hold',     exercise_name:'Hollow Body Hold',            sets:3, reps:'20-30s',       rest_seconds:60,  muscles:'Core profundo, TvA',              note:'Lumbar PEGADA al suelo. Piernas lo más lejos posible.',                   youtube:'Hollow body hold tutorial calisthenics',             priority:'high', is_timer:true,  timer_seconds:25 },
    { exercise_id:'pushup_std',      exercise_name:'Push-up Estándar',            sets:4, reps:'8-12',         rest_seconds:90,  muscles:'Pecho, hombros, tríceps',         note:'Cuerpo rígido como tabla, codos a 45°, pecho toca el suelo.',             youtube:'perfect push up form tutorial',                      priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'pike_pushup',     exercise_name:'Pike Push-up',                sets:3, reps:'8-10',         rest_seconds:90,  muscles:'Deltoides, tríceps',              note:'Caderas arriba en V. Cabeza entre brazos al bajar.',                      youtube:'pike push up tutorial shoulder',                     priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'dips_chair',      exercise_name:'Dips en Silla',               sets:3, reps:'8-12',         rest_seconds:90,  muscles:'Tríceps, hombros',                note:'Espalda pegada al banco, no más de 90° codos.',                           youtube:'tricep dips chair tutorial',                         priority:'low',  is_timer:false, timer_seconds:0  },
    { exercise_id:'plank',           exercise_name:'Plank',                       sets:3, reps:'30-45s',       rest_seconds:60,  muscles:'Core total',                      note:'No dejes caer las caderas. Glúteos apretados.',                           youtube:'perfect plank form tutorial',                        priority:'high', is_timer:true,  timer_seconds:40 },
  ]],
  [1, 'mar', 'Tirón + Movilidad', [
    { exercise_id:'scap_retract',    exercise_name:'Retracción Escapular',        sets:3, reps:'10-12',        rest_seconds:60,  muscles:'Romboides, trapecios',            note:'Brazos rectos, solo sube con omóplatos. Clave para postura.',             youtube:'scapular retraction dead hang tutorial',             priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'australian_pullup',exercise_name:'Australian Pull-up',         sets:4, reps:'8-12',         rest_seconds:90,  muscles:'Dorsal, bíceps, romboides',       note:'Cuerpo rígido, tira el pecho a la barra.',                                youtube:'australian pull up inverted row tutorial',            priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'neg_pullup',      exercise_name:'Dominadas Negativas',         sets:3, reps:'5 (5s bajada)',rest_seconds:120, muscles:'Dorsal, bíceps',                  note:'Sube con silla, baja MUY lento 5 segundos.',                              youtube:'negative pull up tutorial beginners',                priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'face_pull',       exercise_name:'Face Pull (banda/toalla)',    sets:3, reps:'12-15',        rest_seconds:60,  muscles:'Deltoides posterior, manguito',   note:'Jala hacia la cara separando codos. Clave anti-lordosis.',                youtube:'face pull band tutorial posture',                    priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'cat_cow',         exercise_name:'Cat-Cow',                     sets:2, reps:'12 lentos',    rest_seconds:30,  muscles:'Columna, lumbar',                 note:'Lento y controlado. Siente cada vértebra.',                               youtube:'cat cow yoga stretch spine',                         priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'superman',        exercise_name:'Superman Hold',               sets:3, reps:'10 (3s arriba)',rest_seconds:60, muscles:'Erectores, glúteos, lumbar',      note:'Fortalece cadena posterior. Esencial para tu lumbar.',                    youtube:'superman exercise back extension tutorial',          priority:'high', is_timer:false, timer_seconds:0  },
  ]],
  [1, 'mie', 'Lumbar + Stretching Activo', [
    { exercise_id:'hip_flexor',      exercise_name:'Hip Flexor Stretch (Psoas)', sets:3, reps:'60s/lado',      rest_seconds:30,  muscles:'Psoas, ilíaco',                   note:'El psoas apretado ES la causa de tu dolor. 60s mínimo cada lado.',        youtube:'hip flexor stretch psoas tight tutorial',            priority:'high', is_timer:true,  timer_seconds:60 },
    { exercise_id:'pigeon',          exercise_name:'Pigeon Pose',                sets:2, reps:'90s/lado',      rest_seconds:30,  muscles:'Glúteo, piriforme',               note:'Piriforme apretado comprime nervio ciático → dolor lumbar.',               youtube:'pigeon pose tutorial piriformis stretch',            priority:'high', is_timer:true,  timer_seconds:90 },
    { exercise_id:'childs_pose',     exercise_name:"Child's Pose con Tracción",  sets:3, reps:'60s',           rest_seconds:30,  muscles:'Lumbar, dorsal, caderas',         note:'Brazos extendidos al frente. Deja que la gravedad descomprima la columna.',youtube:'child pose yoga extended arms spine',                priority:'high', is_timer:true,  timer_seconds:60 },
    { exercise_id:'glute_bridge',    exercise_name:'Glute Bridge',               sets:4, reps:'15',            rest_seconds:60,  muscles:'Glúteos, isquios, lumbar',        note:'Glúteos débiles sobrecargan la lumbar. Aprieta fuerte arriba, 1s pausa.', youtube:'glute bridge tutorial form',                        priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'dead_bug',        exercise_name:'Dead Bug',                   sets:3, reps:'10/lado',       rest_seconds:60,  muscles:'Core profundo, TvA',              note:'Lumbar PEGADA al suelo todo el tiempo. Lento y controlado.',              youtube:'dead bug exercise core tutorial',                    priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'thoracic_rot',    exercise_name:'Thoracic Rotation',          sets:3, reps:'10/lado',       rest_seconds:30,  muscles:'Columna torácica, oblicuos',      note:'Tumbado de lado, rodillas dobladas, rota solo el torso.',                 youtube:'thoracic rotation stretch tutorial spine',           priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'forward_fold',    exercise_name:'Seated Forward Fold',        sets:3, reps:'60s',           rest_seconds:30,  muscles:'Isquiotibiales, lumbar',          note:'Isquios acortados = postura cifótica = dolor lumbar.',                    youtube:'seated forward fold hamstring stretch tutorial',     priority:'med',  is_timer:true,  timer_seconds:60 },
  ]],
  [1, 'jue', 'Piernas + Glúteos', [
    { exercise_id:'glute_bridge_uni',exercise_name:'Glute Bridge Unilateral',    sets:3, reps:'12/lado',       rest_seconds:60,  muscles:'Glúteo, isquios',                 note:'Corrige desequilibrios L/D que causan dolor lumbar.',                     youtube:'single leg glute bridge tutorial',                   priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'goblet_squat',    exercise_name:'Sentadilla Goblet',          sets:4, reps:'12-15',         rest_seconds:90,  muscles:'Cuádriceps, glúteos, core',       note:'Espalda recta, rodillas sobre puntas de pies, 90°.',                      youtube:'goblet squat bodyweight tutorial form',              priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'reverse_lunge',   exercise_name:'Reverse Lunge',             sets:3, reps:'10/lado',        rest_seconds:90,  muscles:'Cuádriceps, glúteos, isquios',    note:'Paso atrás. Más seguro para rodillas que el lunge frontal.',               youtube:'reverse lunge tutorial form',                        priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'good_morning',    exercise_name:'Good Morning (sin peso)',    sets:3, reps:'12',             rest_seconds:60,  muscles:'Isquios, lumbar, glúteos',        note:'Pies al ancho de hombros, inclina el torso con espalda recta.',           youtube:'good morning exercise bodyweight tutorial',          priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'calf_raise',      exercise_name:'Calf Raises',               sets:3, reps:'20',             rest_seconds:45,  muscles:'Pantorrillas, soleo',             note:'Lento y con rango completo.',                                             youtube:'calf raise tutorial form',                          priority:'low',  is_timer:false, timer_seconds:0  },
    { exercise_id:'wall_sit',        exercise_name:'Wall Sit',                  sets:3, reps:'45s',             rest_seconds:60,  muscles:'Cuádriceps, core',                note:'Espalda plana contra la pared, 90° rodillas.',                            youtube:'wall sit exercise tutorial',                        priority:'med',  is_timer:true,  timer_seconds:45 },
  ]],
  [1, 'vie', 'Full Body + Core Total', [
    { exercise_id:'archer_pushup',   exercise_name:'Archer Push-up (Regresión)', sets:3, reps:'6/lado',        rest_seconds:90,  muscles:'Pecho unilateral',                note:'Brazo guía extendido, carga en el otro. Progresión hacia one-arm.',        youtube:'archer push up tutorial progression',               priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'pullup_neg2',     exercise_name:'Pull-up Asistida o Negativas',sets:4,reps:'5-8',           rest_seconds:120, muscles:'Dorsal, bíceps',                  note:'Usa banda elástica si no puedes hacer pull-up completa.',                  youtube:'assisted pull up band tutorial',                     priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'jump_squat',      exercise_name:'Jump Squat',                sets:3, reps:'10',             rest_seconds:60,  muscles:'Piernas, explosividad',           note:'Aterriza suave con rodillas dobladas. Solo si no hay dolor.',              youtube:'jump squat tutorial plyometric',                     priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'lsit_prog',       exercise_name:'L-sit Progresión',          sets:3, reps:'15-20s',         rest_seconds:90,  muscles:'Core, flexores de cadera',        note:'Empieza apoyando talones en suelo, luego levanta una pierna.',             youtube:'L-sit progression tutorial beginners',              priority:'high', is_timer:true,  timer_seconds:20 },
    { exercise_id:'side_plank',      exercise_name:'Side Plank',                sets:3, reps:'30s/lado',       rest_seconds:60,  muscles:'Oblicuos, cuadrado lumbar',       note:'Cuerpo recto como tabla.',                                                youtube:'side plank tutorial form',                          priority:'med',  is_timer:true,  timer_seconds:30 },
    { exercise_id:'burpees',         exercise_name:'Burpees',                   sets:3, reps:'8-10',           rest_seconds:90,  muscles:'Full body, cardio',               note:'Controlados. Sustituir por mountain climbers si hay dolor.',               youtube:'burpee tutorial form proper',                       priority:'low',  is_timer:false, timer_seconds:0  },
  ]],
  // ── FASE 2 ─────────────────────────────────────────────────────────────────
  [2, 'lun', 'Empuje Avanzado', [
    { exercise_id:'hollow_rock',     exercise_name:'Hollow Body Rock',           sets:3, reps:'15-20',         rest_seconds:60,  muscles:'Core profundo',                   note:'Evolución del Hollow Hold estático. Balanceo controlado.',                youtube:'hollow body rock calisthenics tutorial',             priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'diamond_pushup',  exercise_name:'Diamond Push-up',            sets:4, reps:'8-12',          rest_seconds:90,  muscles:'Tríceps, pecho interno',          note:'Manos en diamante bajo el esternón. Codos juntos al bajar.',               youtube:'diamond push up triceps tutorial',                   priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'wide_pushup',     exercise_name:'Wide Push-up',               sets:3, reps:'10-15',         rest_seconds:90,  muscles:'Pecho externo, deltoides',        note:'Manos más anchas que hombros.',                                           youtube:'wide push up chest tutorial',                       priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'pike_elevated',   exercise_name:'Pike Push-up Elevado',       sets:4, reps:'8-10',          rest_seconds:90,  muscles:'Deltoides, tríceps',              note:'Pies en silla. Más carga en hombros. Evolución hacia HSPU.',               youtube:'elevated pike push up shoulder press tutorial',      priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'dips_parallel',   exercise_name:'Dips Paralelas (2 sillas)',  sets:4, reps:'8-12',          rest_seconds:90,  muscles:'Tríceps, pecho bajo',             note:'Rango completo. No dejes hombros subir.',                                 youtube:'parallel bar dips chairs tutorial',                  priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'plank_shoulder',  exercise_name:'Plank Toque de Hombros',    sets:3, reps:'12/lado',        rest_seconds:60,  muscles:'Core antirotación',               note:'No muevas las caderas al tocar el hombro opuesto.',                       youtube:'plank shoulder tap anti rotation core tutorial',     priority:'high', is_timer:false, timer_seconds:0  },
  ]],
  [2, 'mar', 'Tirón Avanzado', [
    { exercise_id:'pullup_strict',   exercise_name:'Pull-up Estricto',           sets:5, reps:'máx (obj 8-12)',rest_seconds:120, muscles:'Dorsal ancho, bíceps',            note:'Sin kipping. Pausa 1s arriba.',                                           youtube:'strict pull up form tutorial',                       priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'chinup',          exercise_name:'Chin-up (agarre supino)',    sets:4, reps:'máx',           rest_seconds:120, muscles:'Bíceps, dorsal',                  note:'Más fácil que pull-up. Úsalo para acumular volumen.',                      youtube:'chin up supinated grip tutorial',                    priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'renegade_row',    exercise_name:'Renegade Row',               sets:3, reps:'10/lado',       rest_seconds:90,  muscles:'Dorsal, core antirotación',       note:'Desde posición de push-up, jala alternando cada lado.',                   youtube:'renegade row tutorial bodyweight',                   priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'inverted_row_pause',exercise_name:'Inverted Row con Pausa',   sets:4, reps:'10-12',         rest_seconds:90,  muscles:'Romboides, trapecio medio',       note:'2s de pausa arriba. Clave para postura de programador.',                   youtube:'inverted row pause tutorial',                        priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'pull_apart',      exercise_name:'Towel Pull Apart',           sets:3, reps:'15',            rest_seconds:60,  muscles:'Deltoides posterior',             note:'Brazos a la altura de los hombros, separa completamente.',                 youtube:'band pull apart posterior deltoid tutorial',         priority:'med',  is_timer:false, timer_seconds:0  },
  ]],
  [2, 'mie', 'Lumbar Avanzado', [
    { exercise_id:'single_rdl',      exercise_name:'Single Leg RDL',             sets:3, reps:'10/lado',       rest_seconds:60,  muscles:'Isquios, glúteo, lumbar',         note:'Bisagra de cadera perfecta. Espalda neutral todo el tiempo.',              youtube:'single leg RDL bodyweight tutorial',                 priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'glute_bridge_pause',exercise_name:'Glute Bridge con Pausa (3s)',sets:4,reps:'15',           rest_seconds:60,  muscles:'Glúteos, isquios',                note:'Pausa isométrica 3s arriba. Si es fácil: unilateral.',                     youtube:'glute bridge pause isometric tutorial',              priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'dead_bug_adv',    exercise_name:'Dead Bug Avanzado',          sets:3, reps:'12/lado',       rest_seconds:60,  muscles:'Core, TvA',                       note:'Piernas completamente extendidas.',                                        youtube:'dead bug advanced tutorial extended legs',          priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'hip_flexor2',     exercise_name:'Stretching Psoas',           sets:2, reps:'90s/lado',      rest_seconds:30,  muscles:'Psoas, ilíaco',                   note:'Siempre presente. Nunca saltar este.',                                     youtube:'deep hip flexor stretch psoas',                     priority:'high', is_timer:true,  timer_seconds:90 },
    { exercise_id:'thoracic_ext',    exercise_name:'Thoracic Extension (toalla)',sets:3, reps:'60s',           rest_seconds:30,  muscles:'Columna torácica',                note:'Toalla enrollada a altura torácica. Abre el pecho hacia el techo.',        youtube:'thoracic extension foam roller towel tutorial',      priority:'med',  is_timer:true,  timer_seconds:60 },
    { exercise_id:'worlds_stretch',  exercise_name:"World's Greatest Stretch",   sets:3, reps:'6/lado',        rest_seconds:30,  muscles:'Full body, cadena posterior',     note:'El estiramiento más completo que existe.',                                 youtube:'world greatest stretch tutorial',                    priority:'low',  is_timer:false, timer_seconds:0  },
  ]],
  [2, 'jue', 'Piernas Avanzadas', [
    { exercise_id:'bulgarian',       exercise_name:'Bulgarian Split Squat',      sets:4, reps:'10/lado',       rest_seconds:120, muscles:'Cuádriceps, glúteo, isquios',     note:'Pie trasero en banco/silla. El ejercicio de pierna más efectivo.',         youtube:'bulgarian split squat tutorial form',                priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'nordic_curl',     exercise_name:'Nordic Curl (Regresión)',    sets:3, reps:'6-8',           rest_seconds:120, muscles:'Isquiotibiales',                  note:'Ancla los pies bajo el sofá. Previene lesiones.',                          youtube:'nordic curl tutorial hamstrings beginners',          priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'squat_pause',     exercise_name:'Squat con Pausa (3s)',       sets:4, reps:'10',            rest_seconds:90,  muscles:'Cuádriceps, glúteos',             note:'La pausa elimina el rebote y aumenta fuerza real.',                        youtube:'pause squat bodyweight tutorial',                    priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'step_up',         exercise_name:'Step-up Explosivo',          sets:3, reps:'10/lado',       rest_seconds:90,  muscles:'Glúteo, cuádriceps',              note:'Sube fuerte, baja controlado. Usa escalón o silla sólida.',                youtube:'explosive step up tutorial plyometric',              priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'calf_uni',        exercise_name:'Calf Raise Unilateral',      sets:3, reps:'15/lado',       rest_seconds:45,  muscles:'Gastrocnemio, soleo',             note:'Rango completo, sin rebote.',                                             youtube:'single leg calf raise tutorial',                     priority:'low',  is_timer:false, timer_seconds:0  },
  ]],
  [2, 'vie', 'Full Body Intensidad', [
    { exercise_id:'archer2',         exercise_name:'Archer Push-up',             sets:4, reps:'8/lado',        rest_seconds:90,  muscles:'Pecho unilateral',                note:'Brazo guía más extendido cada semana. Progresión hacia one-arm.',          youtube:'archer push up advanced tutorial',                   priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'lsit_full',       exercise_name:'L-sit Paralelas/Sillas',    sets:4, reps:'15-25s',         rest_seconds:90,  muscles:'Core, flexores cadera, hombros',  note:'Piernas rectas si puedes. Si no, rodillas dobladas.',                      youtube:'L-sit on chairs tutorial progression',               priority:'high', is_timer:true,  timer_seconds:20 },
    { exercise_id:'muscleup_neg',    exercise_name:'Muscle-up Negativo',         sets:3, reps:'5 (5s)',         rest_seconds:120, muscles:'Full tirón + empuje',             note:'Súbete con silla, baja muy lento pasando la transición.',                  youtube:'muscle up negative tutorial progression',            priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'pistol_prog',     exercise_name:'Pistol Squat Progresión',   sets:3, reps:'8/lado',         rest_seconds:90,  muscles:'Cuádriceps, glúteo, equilibrio',  note:'Empieza sentándote en silla con una pierna levantada.',                    youtube:'pistol squat progression tutorial beginners',        priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'hollow_arch',     exercise_name:'Hollow-to-Arch Swing',      sets:3, reps:'10',             rest_seconds:60,  muscles:'Core total, dorsal, glúteos',     note:'En barra, oscila entre posición hollow y arch de forma controlada.',       youtube:'hollow arch swing bar calisthenics tutorial',        priority:'med',  is_timer:false, timer_seconds:0  },
  ]],
  // ── FASE 3 ─────────────────────────────────────────────────────────────────
  [3, 'lun', 'Empuje + Handstand', [
    { exercise_id:'handstand_wall',  exercise_name:'Handstand contra Pared',     sets:3, reps:'30-60s',        rest_seconds:120, muscles:'Hombros, core, equilibrio',       note:'Manos a 10-15cm de la pared. Cuerpo recto, no arquear la espalda.',        youtube:'handstand against wall tutorial beginner',           priority:'high', is_timer:true,  timer_seconds:45 },
    { exercise_id:'pike_hspu',       exercise_name:'Pike HSPU',                  sets:4, reps:'6-10',          rest_seconds:120, muscles:'Deltoides, tríceps',              note:'Pies en silla alta. Objetivo: handstand push-up completo.',                youtube:'pike handstand push up tutorial',                    priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'one_arm_prog',    exercise_name:'One-Arm Push-up Progresión', sets:4, reps:'5/lado',        rest_seconds:120, muscles:'Pecho unilateral total',          note:'Desde rodillas o con mano elevada en pelota.',                            youtube:'one arm push up progression tutorial',               priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'pseudo_planche',  exercise_name:'Pseudo Planche Push-up',     sets:3, reps:'6-8',           rest_seconds:120, muscles:'Hombros anteriores, pecho',       note:'Dedos hacia los pies, cuerpo ligeramente hacia adelante.',                 youtube:'pseudo planche push up tutorial',                    priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'planche_lean',    exercise_name:'Planche Lean',               sets:4, reps:'20-30s',        rest_seconds:90,  muscles:'Hombros, wrist, core',            note:'Inclínate hacia adelante sobre manos. Prepara la planche.',                youtube:'planche lean tutorial progression',                  priority:'med',  is_timer:true,  timer_seconds:25 },
  ]],
  [3, 'mar', 'Tirón + Skills', [
    { exercise_id:'weighted_pullup', exercise_name:'Pull-up con Mochila',        sets:5, reps:'6-8',           rest_seconds:180, muscles:'Dorsal, bíceps',                  note:'Mochila con 5-10kg. Si tienes dominadas sólidas.',                         youtube:'weighted pull up backpack tutorial',                 priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'muscleup_real',   exercise_name:'Muscle-up',                  sets:3, reps:'3-5 (o negativas)',rest_seconds:180,muscles:'Pull + Push completo',           note:'Si aún no llegas: 5 negativas muy lentas.',                               youtube:'muscle up tutorial step by step',                    priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'front_lever_tuck',exercise_name:'Front Lever Tucked',         sets:4, reps:'10-20s',        rest_seconds:120, muscles:'Dorsal, core, escápulas',         note:'Rodillas al pecho. Cuerpo horizontal. Muy exigente.',                      youtube:'front lever tuck tutorial progression',              priority:'high', is_timer:true,  timer_seconds:15 },
    { exercise_id:'typewriter_pullup',exercise_name:'Typewriter Pull-up',        sets:3, reps:'6 totales',     rest_seconds:120, muscles:'Dorsal unilateral',               note:'Sube al centro, desliza a un lado, al otro, baja.',                        youtube:'typewriter pull up tutorial advanced',               priority:'med',  is_timer:false, timer_seconds:0  },
  ]],
  [3, 'mie', 'Lumbar Mantenimiento', [
    { exercise_id:'hip_flexor_deep', exercise_name:'Hip Flexor 90/90',           sets:3, reps:'90s/lado',      rest_seconds:30,  muscles:'Psoas, cápsula de cadera',        note:'Posición 90/90 en el suelo. Más profundo que el básico.',                  youtube:'90 90 hip flexor stretch tutorial',                  priority:'high', is_timer:true,  timer_seconds:90 },
    { exercise_id:'jefferson_curl',  exercise_name:'Jefferson Curl (muy lento)', sets:3, reps:'8',             rest_seconds:60,  muscles:'Columna, isquios, lumbar',        note:'Enrolla la columna vertebra por vertebra. MUY lento.',                     youtube:'jefferson curl tutorial spine mobility',             priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'cossack_squat',   exercise_name:'Cossack Squat',              sets:3, reps:'8/lado',        rest_seconds:60,  muscles:'Aductores, cadera, movilidad',    note:'Sentadilla lateral profunda. Trabaja movilidad de cadera y lumbar.',        youtube:'cossack squat tutorial mobility',                    priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'glute_bridge_march',exercise_name:'Glute Bridge March',       sets:3, reps:'12/lado',       rest_seconds:60,  muscles:'Glúteos, core estabilizador',     note:'Desde bridge, levanta alternando rodillas al pecho.',                      youtube:'glute bridge march tutorial',                        priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'thoracic_mobility',exercise_name:'Thoracic Mobility Full',    sets:2, reps:'10 min total',  rest_seconds:0,   muscles:'Columna torácica completa',       note:'Rotaciones, extensiones, foam roller. Rutina completa.',                   youtube:'thoracic spine mobility routine programmer',         priority:'high', is_timer:false, timer_seconds:0  },
  ]],
  [3, 'jue', 'Piernas + Pistol Squat', [
    { exercise_id:'pistol_free',     exercise_name:'Pistol Squat Libre',         sets:4, reps:'5/lado',        rest_seconds:120, muscles:'Cuádriceps, glúteo, equilibrio',  note:'Sin apoyo. Necesita fuerza, movilidad de tobillo y equilibrio.',           youtube:'pistol squat free tutorial',                        priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'nordic_adv',      exercise_name:'Nordic Curl Completo',       sets:3, reps:'5-8',           rest_seconds:120, muscles:'Isquiotibiales',                  note:'Rango completo al suelo. Usa las manos al final si necesario.',             youtube:'nordic hamstring curl full tutorial',                priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'bulgarian_adv',   exercise_name:'Bulgarian Split + Salto',    sets:3, reps:'8/lado',        rest_seconds:120, muscles:'Explosividad piernas',            note:'Salta al cambiar de pierna. Alta intensidad.',                             youtube:'bulgarian split squat jump plyometric tutorial',     priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'shrimp_squat',    exercise_name:'Shrimp Squat Progresión',    sets:3, reps:'6/lado',        rest_seconds:90,  muscles:'Cuádriceps, equilibrio',          note:'Pie trasero en la mano detrás. Más difícil que el pistol.',                youtube:'shrimp squat tutorial progression',                  priority:'med',  is_timer:false, timer_seconds:0  },
  ]],
  [3, 'vie', 'Skills Day', [
    { exercise_id:'lsit_30s',        exercise_name:'L-sit 30s',                  sets:5, reps:'30s',           rest_seconds:120, muscles:'Core, flexores, hombros',         note:'Objetivo de la fase: 30s continuos con piernas rectas.',                   youtube:'L-sit 30 seconds tutorial progression',              priority:'high', is_timer:true,  timer_seconds:30 },
    { exercise_id:'handstand_free',  exercise_name:'Handstand Libre (intentos)', sets:0, reps:'intentos 5-15s',rest_seconds:60,  muscles:'Equilibrio, hombros, core',       note:'Practica el balance libre. Múltiples intentos con descanso.',              youtube:'freestanding handstand tutorial balance',            priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'human_flag_prog', exercise_name:'Human Flag Progresión',      sets:3, reps:'5-10s',         rest_seconds:120, muscles:'Oblicuos, hombros, dorsal',       note:'Empieza con tucked. Uno de los skills más impresionantes.',                youtube:'human flag progression tutorial beginners',          priority:'med',  is_timer:true,  timer_seconds:8  },
    { exercise_id:'front_lever_single',exercise_name:'Front Lever Single Leg',   sets:3, reps:'10-15s',        rest_seconds:120, muscles:'Dorsal, core',                    note:'Una pierna extendida. Progresión al front lever completo.',                 youtube:'front lever single leg tutorial progression',        priority:'med',  is_timer:true,  timer_seconds:12 },
  ]],
  // ── FASE 4 ─────────────────────────────────────────────────────────────────
  [4, 'lun', 'Peak Push + Handstand', [
    { exercise_id:'hspu_wall',       exercise_name:'Handstand Push-up (pared)',  sets:5, reps:'5-8',           rest_seconds:180, muscles:'Deltoides, tríceps, core',        note:'Handstand contra la pared, baja la cabeza al suelo. Elite.',              youtube:'handstand push up wall tutorial',                    priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'one_arm_actual',  exercise_name:'One-Arm Push-up',            sets:4, reps:'5/lado',        rest_seconds:120, muscles:'Pecho unilateral total',          note:'Si no llegas: archer push-up máximo inclinado.',                           youtube:'one arm push up tutorial full',                     priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'planche_tuck',    exercise_name:'Tuck Planche',               sets:4, reps:'5-15s',         rest_seconds:120, muscles:'Hombros anteriores, core',        note:'Rodillas al pecho, cuerpo horizontal. Extremadamente difícil.',            youtube:'tuck planche tutorial progression',                  priority:'high', is_timer:true,  timer_seconds:10 },
    { exercise_id:'ring_dip_prog',   exercise_name:'Ring Dips (o Dips con peso)',sets:4, reps:'8-10',          rest_seconds:120, muscles:'Tríceps, pecho, estabilizadores', note:'Anillas o mochila. Nivel avanzado.',                                       youtube:'ring dips tutorial beginner progression',            priority:'med',  is_timer:false, timer_seconds:0  },
  ]],
  [4, 'mar', 'Peak Pull + Skills', [
    { exercise_id:'front_lever_full',exercise_name:'Front Lever Completo',       sets:4, reps:'5-10s',         rest_seconds:180, muscles:'Dorsal, core, escápulas',         note:'Cuerpo completamente horizontal. El skill de tirón más impresionante.',    youtube:'front lever full tutorial',                         priority:'high', is_timer:true,  timer_seconds:8  },
    { exercise_id:'one_arm_pullup_prog',exercise_name:'One-Arm Pull-up Progresión',sets:4,reps:'3-5/lado',     rest_seconds:180, muscles:'Dorsal unilateral',               note:'Con banda o desde medio agarre.',                                          youtube:'one arm pull up progression tutorial',               priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'muscleup_flow',   exercise_name:'Muscle-up x5 Flow',          sets:4, reps:'5 seguidos',    rest_seconds:180, muscles:'Full tirón + empuje',             note:'5 seguidos sin soltar la barra. Peak de tirón.',                           youtube:'muscle up 5 in a row tutorial',                      priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'back_lever',      exercise_name:'Back Lever Progresión',      sets:3, reps:'5-15s',         rest_seconds:120, muscles:'Hombros, pecho, core',            note:'Empieza con tucked back lever.',                                           youtube:'back lever progression tutorial beginners',          priority:'med',  is_timer:true,  timer_seconds:10 },
  ]],
  [4, 'mie', 'Lumbar Elite + Movilidad', [
    { exercise_id:'yoga_flow_lumbar',exercise_name:'Yoga Flow Lumbar (15 min)',  sets:1, reps:'15 min',         rest_seconds:0,   muscles:'Columna completa, caderas',       note:'Rutina de yoga específica para lumbar. Sigue un video completo.',          youtube:'yoga flow lower back pain relief 15 minutes',        priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'jefferson_adv',   exercise_name:'Jefferson Curl + Peso',      sets:3, reps:'8 (con 2-5kg)', rest_seconds:60,  muscles:'Columna, isquios',                note:'Ahora con ligero peso. Máxima movilidad espinal.',                         youtube:'jefferson curl weighted tutorial',                   priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'deep_hip_mobility',exercise_name:'Hip Mobility Full Routine', sets:1, reps:'10 min',         rest_seconds:0,   muscles:'Cadera completa, lumbar',         note:'Rutina completa de movilidad de cadera. Sigue un video.',                  youtube:'hip mobility full routine 10 minutes',               priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'glute_activation_peak',exercise_name:'Glute Activation Peak',sets:4, reps:'20',             rest_seconds:45,  muscles:'Glúteos, isquios',                note:'X-band walk, clam shell, frog pump. Activación completa.',                 youtube:'glute activation routine complete tutorial',         priority:'high', is_timer:false, timer_seconds:0  },
  ]],
  [4, 'jue', 'Peak Legs', [
    { exercise_id:'pistol_vol',      exercise_name:'Pistol Squat Volumen',       sets:5, reps:'8/lado',         rest_seconds:90,  muscles:'Cuádriceps, glúteo',              note:'5 series de 8. Máximo volumen de pierna en calistenia.',                   youtube:'pistol squat volume training tutorial',              priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'nordic_full',     exercise_name:'Nordic Curl Full',            sets:4, reps:'8-10',          rest_seconds:120, muscles:'Isquiotibiales',                  note:'Sin usar las manos al final. Fuerza excéntrica máxima.',                   youtube:'nordic hamstring curl advanced',                     priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'shrimp_full',     exercise_name:'Shrimp Squat Completo',      sets:3, reps:'8/lado',         rest_seconds:90,  muscles:'Cuádriceps, tobillo, equilibrio', note:'Rodilla trasera toca el suelo suavemente.',                               youtube:'shrimp squat full tutorial',                        priority:'med',  is_timer:false, timer_seconds:0  },
    { exercise_id:'box_jump',        exercise_name:'Box Jump (silla sólida)',    sets:4, reps:'8',              rest_seconds:90,  muscles:'Explosividad total',              note:'Salta sobre una silla sólida o escalón. Aterriza suave.',                  youtube:'box jump tutorial plyometric form',                  priority:'med',  is_timer:false, timer_seconds:0  },
  ]],
  [4, 'vie', 'Skills Peak Day', [
    { exercise_id:'skill_complex',   exercise_name:'Skill Complex (elige 3 skills)',sets:3,reps:'según skill', rest_seconds:180, muscles:'Variable',                        note:'Escoge tus 3 skills favoritos y practica. Handstand, L-sit, muscle-up, front lever.',youtube:'calisthenics skills complex advanced',       priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'lsit_45',         exercise_name:'L-sit 45s Objetivo',         sets:4, reps:'máx (obj 45s)', rest_seconds:120, muscles:'Core, flexores, hombros',         note:'Objetivo final del programa. 45 segundos continuos.',                      youtube:'L-sit 45 seconds tutorial',                         priority:'high', is_timer:true,  timer_seconds:45 },
    { exercise_id:'handstand_60',    exercise_name:'Handstand 60s Libre',        sets:0, reps:'obj 60s libre',  rest_seconds:60,  muscles:'Equilibrio total',                note:'Objetivo: 60s de handstand libre al terminar los 6 meses.',               youtube:'freestanding handstand 60 seconds tutorial',        priority:'high', is_timer:false, timer_seconds:0  },
    { exercise_id:'strength_test',   exercise_name:'Test de Fuerza Mensual',     sets:1, reps:'máx en todo',   rest_seconds:300, muscles:'Full body',                       note:'Último viernes del mes: pull-up máx, push-up máx, L-sit tiempo, pistol squat máx. Anota y compara.',youtube:'calisthenics strength test benchmark', priority:'high', is_timer:false, timer_seconds:0  },
  ]],
]

// ─── Main ────────────────────────────────────────────────────────────────────

async function ensureField(col, fieldDef) {
  const has = (col.fields || []).some(f => f.name === fieldDef.name)
  if (!has) {
    await pb.collections.update(col.id, { fields: [...(col.fields || []), fieldDef] })
    return true
  }
  return false
}

async function main() {
  console.log('Autenticando como superusuario...')
  await pb.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD)
  console.log('OK\n')

  const existing = await pb.collections.getFullList()
  const existingNames = new Set(existing.map(c => c.name))
  const byName = Object.fromEntries(existing.map(c => [c.name, c]))

  // ── 1. users ────────────────────────────────────────────────────────────────
  if (existingNames.has('users')) {
    process.stdout.write('Colección "users" ya existe, verificando campo display_name... ')
    const added = await ensureField(byName['users'], { name: 'display_name', type: 'text', required: false })
    console.log(added ? '→ añadido' : 'OK')
  } else {
    console.log('Creando colección "users" (auth)...')
    await pb.collections.create({
      name: 'users', type: 'auth',
      fields: [{ name: 'display_name', type: 'text', required: false }],
      listRule: 'id = @request.auth.id', viewRule: 'id = @request.auth.id',
      createRule: '', updateRule: 'id = @request.auth.id', deleteRule: 'id = @request.auth.id',
    })
  }
  console.log('users OK\n')

  // ── 2. settings ─────────────────────────────────────────────────────────────
  if (existingNames.has('settings')) {
    process.stdout.write('Colección "settings" ya existe, verificando campos... ')
    const col = byName['settings']
    const missing = [
      { name: 'pr_pullups',   type: 'number', required: false },
      { name: 'pr_pushups',   type: 'number', required: false },
      { name: 'pr_lsit',      type: 'number', required: false },
      { name: 'pr_pistol',    type: 'number', required: false },
      { name: 'pr_handstand', type: 'number', required: false },
      // active_program stored in user_programs now, but keep for backwards compat
    ].filter(f => !(col.fields || []).some(e => e.name === f.name))
    if (missing.length) {
      await pb.collections.update(col.id, { fields: [...(col.fields || []), ...missing] })
      console.log(`→ añadidos: ${missing.map(f => f.name).join(', ')}`)
    } else { console.log('OK') }
  } else {
    console.log('Creando colección "settings"...')
    await pb.collections.create({
      name: 'settings', type: 'base',
      fields: [
        userRelationField,
        { name: 'phase',        type: 'number', required: true,  min: 1, max: 4 },
        { name: 'start_date',   type: 'date',   required: false },
        { name: 'weekly_goal',  type: 'number', required: false, min: 1, max: 7 },
        { name: 'pr_pullups',   type: 'number', required: false },
        { name: 'pr_pushups',   type: 'number', required: false },
        { name: 'pr_lsit',      type: 'number', required: false },
        { name: 'pr_pistol',    type: 'number', required: false },
        { name: 'pr_handstand', type: 'number', required: false },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_settings_user ON settings (user)'],
      listRule:   'user = @request.auth.id',
      viewRule:   'user = @request.auth.id',
      createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
      // Prevent re-assigning the user field to another user's ID
      updateRule: 'user = @request.auth.id && @request.body.user:isset = false',
      deleteRule: 'user = @request.auth.id',
    })
  }
  console.log('settings OK\n')

  // ── 3. sessions ─────────────────────────────────────────────────────────────
  if (existingNames.has('sessions')) {
    process.stdout.write('Colección "sessions" ya existe, verificando campos... ')
    const col = byName['sessions']
    const missing = [
      { name: 'note',    type: 'text',     required: false },
      { name: 'program', type: 'relation', required: false, collectionId: null /* filled below */, maxSelect: 1, cascadeDelete: false },
    ].filter(f => !(col.fields || []).some(e => e.name === f.name))
    // program field needs the programs collection ID — we'll add it after programs collection is created
    const noteOnly = missing.filter(f => f.name !== 'program')
    if (noteOnly.length) {
      await pb.collections.update(col.id, { fields: [...(col.fields || []), ...noteOnly] })
    }
    console.log(missing.length ? `→ añadidos: ${noteOnly.map(f => f.name).join(', ')} (program: after programs collection)` : 'OK')
  } else {
    console.log('Creando colección "sessions"...')
    await pb.collections.create({
      name: 'sessions', type: 'base',
      fields: [
        userRelationField,
        { name: 'workout_key',  type: 'text',   required: true },
        { name: 'phase',        type: 'number', required: true, min: 1, max: 4 },
        { name: 'day',          type: 'text',   required: true },
        { name: 'completed_at', type: 'date',   required: true },
        { name: 'note',         type: 'text',   required: false },
        // program relation added after programs collection
      ],
      indexes: [
        'CREATE INDEX idx_sessions_user ON sessions (user)',
        'CREATE INDEX idx_sessions_user_date ON sessions (user, completed_at)',
        'CREATE INDEX idx_sessions_workout_key ON sessions (user, workout_key)',
      ],
      listRule:   'user = @request.auth.id',
      viewRule:   'user = @request.auth.id',
      createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
      // Prevent re-assigning the user field to another user's ID
      updateRule: 'user = @request.auth.id && @request.body.user:isset = false',
      deleteRule: 'user = @request.auth.id',
    })
  }
  console.log('sessions OK\n')

  // ── 4. sets_log ─────────────────────────────────────────────────────────────
  if (existingNames.has('sets_log')) {
    console.log('Colección "sets_log" ya existe, omitiendo...')
  } else {
    console.log('Creando colección "sets_log"...')
    await pb.collections.create({
      name: 'sets_log', type: 'base',
      fields: [
        userRelationField,
        { name: 'exercise_id', type: 'text', required: true },
        { name: 'workout_key', type: 'text', required: true },
        { name: 'reps',        type: 'text', required: false },
        { name: 'note',        type: 'text', required: false },
        { name: 'logged_at',   type: 'date', required: true },
      ],
      indexes: [
        'CREATE INDEX idx_sets_log_user ON sets_log (user)',
        'CREATE INDEX idx_sets_log_user_exercise ON sets_log (user, exercise_id)',
        'CREATE INDEX idx_sets_log_user_date ON sets_log (user, logged_at)',
      ],
      listRule:   'user = @request.auth.id',
      viewRule:   'user = @request.auth.id',
      createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
      // Prevent re-assigning the user field to another user's ID
      updateRule: 'user = @request.auth.id && @request.body.user:isset = false',
      deleteRule: 'user = @request.auth.id',
    })
  }
  console.log('sets_log OK\n')

  // ── 5. lumbar_checks ────────────────────────────────────────────────────────
  if (existingNames.has('lumbar_checks')) {
    console.log('Colección "lumbar_checks" ya existe, omitiendo...')
  } else {
    console.log('Creando colección "lumbar_checks"...')
    await pb.collections.create({
      name: 'lumbar_checks', type: 'base',
      fields: [
        userRelationField,
        { name: 'date',          type: 'text',   required: true },
        { name: 'lumbar_score',  type: 'number', required: true, min: 1, max: 5 },
        { name: 'slept_well',    type: 'bool',   required: false },
        { name: 'sitting_hours', type: 'number', required: false },
        { name: 'checked_at',    type: 'date',   required: false },
      ],
      indexes: [
        'CREATE INDEX idx_lumbar_checks_user ON lumbar_checks (user)',
        'CREATE INDEX idx_lumbar_checks_user_date ON lumbar_checks (user, date)',
      ],
      listRule:   'user = @request.auth.id',
      viewRule:   'user = @request.auth.id',
      createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
      // Prevent re-assigning the user field to another user's ID
      updateRule: 'user = @request.auth.id && @request.body.user:isset = false',
      deleteRule: 'user = @request.auth.id',
    })
  }
  console.log('lumbar_checks OK\n')

  // ── 6. programs ─────────────────────────────────────────────────────────────
  let programsColId
  if (existingNames.has('programs')) {
    programsColId = byName['programs'].id
    console.log('Colección "programs" ya existe, omitiendo creación...')
  } else {
    console.log('Creando colección "programs"...')
    const col = await pb.collections.create({
      name: 'programs', type: 'base',
      fields: [
        { name: 'name',           type: 'text',   required: true },
        { name: 'description',    type: 'text',   required: false },
        { name: 'duration_weeks', type: 'number', required: false },
        { name: 'is_active',      type: 'bool',   required: false },
      ],
      // Public read so the catalog is available to all authenticated users
      listRule:   '@request.auth.id != ""',
      viewRule:   '@request.auth.id != ""',
      createRule: null,   // admin only
      updateRule: null,
      deleteRule: null,
    })
    programsColId = col.id
  }
  console.log('programs OK\n')

  // ── 7. program_phases ───────────────────────────────────────────────────────
  if (existingNames.has('program_phases')) {
    console.log('Colección "program_phases" ya existe, omitiendo creación...')
  } else {
    console.log('Creando colección "program_phases"...')
    await pb.collections.create({
      name: 'program_phases', type: 'base',
      fields: [
        { name: 'program',      type: 'relation', required: true, collectionId: programsColId, maxSelect: 1, cascadeDelete: true },
        { name: 'phase_number', type: 'number',   required: true },
        { name: 'name',         type: 'text',     required: true },
        { name: 'weeks',        type: 'text',     required: false },
        { name: 'color',        type: 'text',     required: false },
        { name: 'bg_color',     type: 'text',     required: false },
        { name: 'sort_order',   type: 'number',   required: false },
      ],
      indexes: ['CREATE INDEX idx_prog_phases_program ON program_phases (program)'],
      listRule:   '@request.auth.id != ""',
      viewRule:   '@request.auth.id != ""',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    })
  }
  console.log('program_phases OK\n')

  // ── 8. program_exercises ────────────────────────────────────────────────────
  if (existingNames.has('program_exercises')) {
    console.log('Colección "program_exercises" ya existe, omitiendo creación...')
  } else {
    console.log('Creando colección "program_exercises"...')
    await pb.collections.create({
      name: 'program_exercises', type: 'base',
      fields: [
        { name: 'program',       type: 'relation', required: true, collectionId: programsColId, maxSelect: 1, cascadeDelete: true },
        { name: 'phase_number',  type: 'number',   required: true },
        { name: 'day_id',        type: 'text',     required: true },
        { name: 'day_type',      type: 'text',     required: false },
        { name: 'day_name',      type: 'text',     required: false },
        { name: 'day_focus',     type: 'text',     required: false },
        { name: 'day_color',     type: 'text',     required: false },
        { name: 'workout_title', type: 'text',     required: false },
        { name: 'exercise_id',   type: 'text',     required: true },
        { name: 'exercise_name', type: 'text',     required: true },
        { name: 'sets',          type: 'number',   required: false },
        { name: 'reps',          type: 'text',     required: false },
        { name: 'rest_seconds',  type: 'number',   required: false },
        { name: 'muscles',       type: 'text',     required: false },
        { name: 'note',          type: 'text',     required: false },
        { name: 'youtube',       type: 'text',     required: false },
        { name: 'priority',      type: 'text',     required: false },
        { name: 'is_timer',      type: 'bool',     required: false },
        { name: 'timer_seconds', type: 'number',   required: false },
        { name: 'sort_order',    type: 'number',   required: false },
      ],
      indexes: [
        'CREATE INDEX idx_prog_ex_program ON program_exercises (program)',
        'CREATE INDEX idx_prog_ex_phase ON program_exercises (program, phase_number)',
        'CREATE INDEX idx_prog_ex_day ON program_exercises (program, phase_number, day_id)',
      ],
      listRule:   '@request.auth.id != ""',
      viewRule:   '@request.auth.id != ""',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    })
  }
  console.log('program_exercises OK\n')

  // ── 9. user_programs ────────────────────────────────────────────────────────
  if (existingNames.has('user_programs')) {
    console.log('Colección "user_programs" ya existe, omitiendo creación...')
  } else {
    console.log('Creando colección "user_programs"...')
    await pb.collections.create({
      name: 'user_programs', type: 'base',
      fields: [
        userRelationField,
        { name: 'program',    type: 'relation', required: true,  collectionId: programsColId, maxSelect: 1, cascadeDelete: false },
        { name: 'started_at', type: 'date',     required: false },
        { name: 'is_current', type: 'bool',     required: false },
      ],
      indexes: [
        'CREATE INDEX idx_user_programs_user ON user_programs (user)',
        'CREATE INDEX idx_user_programs_current ON user_programs (user, is_current)',
      ],
      listRule:   'user = @request.auth.id',
      viewRule:   'user = @request.auth.id',
      createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
      // Prevent re-assigning the user field to another user's ID
      updateRule: 'user = @request.auth.id && @request.body.user:isset = false',
      deleteRule: 'user = @request.auth.id',
    })
  }
  console.log('user_programs OK\n')

  // ── 10. Patch sessions.program relation ─────────────────────────────────────
  {
    const sessionsCol = (await pb.collections.getFullList()).find(c => c.name === 'sessions')
    const hasProgramField = (sessionsCol?.fields || []).some(f => f.name === 'program')
    if (!hasProgramField) {
      process.stdout.write('Añadiendo campo "program" a sessions... ')
      await pb.collections.update(sessionsCol.id, {
        fields: [
          ...(sessionsCol.fields || []),
          { name: 'program', type: 'relation', required: false, collectionId: programsColId, maxSelect: 1, cascadeDelete: false },
        ],
      })
      console.log('OK')
    } else {
      console.log('sessions.program ya existe, OK')
    }
  }
  console.log()

  // ── 11. Security patch: harden updateRule on all user-owned collections ──────
  // Prevents any authenticated user from re-assigning the `user` field on an
  // existing record to another user's ID (IDOR / ownership-takeover vector).
  {
    const SECURE_UPDATE_RULE = 'user = @request.auth.id && @request.body.user:isset = false'
    const OWNED_COLLECTIONS = ['settings', 'sessions', 'sets_log', 'lumbar_checks', 'user_programs']
    const latest = await pb.collections.getFullList()
    for (const name of OWNED_COLLECTIONS) {
      const col = latest.find(c => c.name === name)
      if (!col) continue
      if (col.updateRule === SECURE_UPDATE_RULE) {
        console.log(`${name}.updateRule already hardened, OK`)
      } else {
        process.stdout.write(`Hardening ${name}.updateRule... `)
        await pb.collections.update(col.id, { updateRule: SECURE_UPDATE_RULE })
        console.log('OK')
      }
    }
  }
  console.log()

  // ── 12. Referral system: referral_code on users ──────────────────────────────
  {
    const usersCol = (await pb.collections.getFullList()).find(c => c.name === 'users')
    if (usersCol) {
      const hasReferralCode = (usersCol.fields || []).some(f => f.name === 'referral_code')
      if (!hasReferralCode) {
        process.stdout.write('Adding referral_code to users... ')
        const newFields = [...(usersCol.fields || []), {
          name: 'referral_code', type: 'text', required: false, max: 20,
          pattern: '^[A-Z0-9\\-]*$',
        }]
        const newIndexes = [...(usersCol.indexes || []),
          "CREATE UNIQUE INDEX idx_users_referral_code ON users (referral_code) WHERE referral_code != ''"
        ]
        await pb.collections.update(usersCol.id, {
          fields: newFields,
          indexes: newIndexes,
          listRule: '',
          viewRule: '',
        })
        console.log('OK')
      } else {
        // Ensure public list/view for invite landing
        if (usersCol.listRule !== '') {
          process.stdout.write('Updating users list/view rules to public... ')
          await pb.collections.update(usersCol.id, { listRule: '', viewRule: '' })
          console.log('OK')
        } else {
          console.log('users.referral_code already exists, OK')
        }
      }
    }
  }

  // ── 13. Referral system: referrals collection ───────────────────────────────
  if (!existingNames.has('referrals')) {
    console.log('Creando colección "referrals"...')
    const challengesCol = (await pb.collections.getFullList()).find(c => c.name === 'challenges')
    await pb.collections.create({
      name: 'referrals', type: 'base',
      fields: [
        { name: 'referrer', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false },
        { name: 'referred', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false },
        { name: 'source', type: 'select', required: true, values: ['quick_invite', 'challenge'] },
        { name: 'challenge_id', type: 'relation', required: false, collectionId: challengesCol?.id || 'challenges', maxSelect: 1, cascadeDelete: false },
      ],
      indexes: [
        'CREATE INDEX idx_referrals_referrer ON referrals (referrer)',
        'CREATE INDEX idx_referrals_referred ON referrals (referred)',
        'CREATE UNIQUE INDEX idx_referrals_unique_pair ON referrals (referrer, referred)',
      ],
      listRule: 'referrer = @request.auth.id',
      viewRule: 'referrer = @request.auth.id',
      createRule: '@request.auth.id != "" && @request.body.referrer = @request.auth.id',
      updateRule: null,
      deleteRule: null,
    })
  } else {
    console.log('referrals already exists, OK')
  }
  console.log('referrals OK\n')

  // ── 14. Referral system: point_transactions collection ──────────────────────
  if (!existingNames.has('point_transactions')) {
    console.log('Creando colección "point_transactions"...')
    await pb.collections.create({
      name: 'point_transactions', type: 'base',
      fields: [
        { name: 'user', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: true },
        { name: 'amount', type: 'number', required: true },
        { name: 'type', type: 'select', required: true, values: ['referral_signup', 'referral_bonus', 'challenge_complete', 'ai_usage'] },
        { name: 'reference_id', type: 'text', required: false },
        { name: 'description', type: 'text', required: false },
      ],
      indexes: [
        'CREATE INDEX idx_point_transactions_user ON point_transactions (user)',
        'CREATE INDEX idx_point_transactions_type ON point_transactions (type)',
      ],
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
      updateRule: null,
      deleteRule: null,
    })
  } else {
    console.log('point_transactions already exists, OK')
  }
  console.log('point_transactions OK\n')

  // ── 15. Referral system: express fields on challenges ───────────────────────
  {
    const challengesCol = (await pb.collections.getFullList()).find(c => c.name === 'challenges')
    if (challengesCol) {
      const hasType = (challengesCol.fields || []).some(f => f.name === 'type')
      if (!hasType) {
        process.stdout.write('Adding express fields to challenges... ')
        const exercisesCol = (await pb.collections.getFullList()).find(c => c.name === 'exercises_catalog')
        const newFields = [...(challengesCol.fields || []),
          { name: 'type', type: 'select', required: false, values: ['standard', 'express'] },
          { name: 'exercise_id', type: 'relation', required: false, collectionId: exercisesCol?.id || 'exercises_catalog', maxSelect: 1, cascadeDelete: false },
          { name: 'daily_target', type: 'number', required: false, min: 0 },
          { name: 'duration_days', type: 'number', required: false, min: 1, onlyInt: true },
        ]
        const newIndexes = [...(challengesCol.indexes || []),
          'CREATE INDEX idx_challenges_type ON challenges (type)',
        ]
        await pb.collections.update(challengesCol.id, { fields: newFields, indexes: newIndexes })
        console.log('OK')
      } else {
        console.log('challenges express fields already exist, OK')
      }
    }
  }

  // ── 16. Public user_stats for invite landing ────────────────────────────────
  {
    const statsCol = (await pb.collections.getFullList()).find(c => c.name === 'user_stats')
    if (statsCol && statsCol.listRule !== '') {
      process.stdout.write('Setting user_stats to public read... ')
      await pb.collections.update(statsCol.id, { listRule: '', viewRule: '' })
      console.log('OK')
    } else {
      console.log('user_stats already public, OK')
    }
  }
  console.log()

  // ── 17. Seed: Calistenia 6M program ─────────────────────────────────────────
  // Idempotent: skip if already seeded
  const existingPrograms = await pb.collection('programs').getList(1, 10)
  const alreadySeeded = existingPrograms.items.some(p => p.name === 'Calistenia 6M')

  if (alreadySeeded) {
    console.log('Programa "Calistenia 6M" ya existe, omitiendo seed.')
  } else {
    console.log('Seeding programa "Calistenia 6M"...')

    // Create program
    const program = await pb.collection('programs').create({
      name: 'Calistenia 6M',
      description: 'Programa de 26 semanas de calistenia con enfoque en fuerza, movilidad lumbar y skills avanzados. Ideal para programadores y trabajadores de oficina.',
      duration_weeks: 26,
      is_active: true,
    })
    console.log(`  → program creado: ${program.id}`)

    // Create phases
    const phaseIdMap = {} // phase_number → PB record id
    for (const ph of SEED_PHASES) {
      const rec = await pb.collection('program_phases').create({ program: program.id, ...ph })
      phaseIdMap[ph.phase_number] = rec.id
    }
    console.log(`  → ${SEED_PHASES.length} fases creadas`)

    // Create exercises (batch)
    let exCount = 0
    for (const [phaseNum, dayId, workoutTitle, exercises] of SEED_WORKOUTS) {
      const meta = DAY_META[dayId]
      for (let i = 0; i < exercises.length; i++) {
        await pb.collection('program_exercises').create({
          program:       program.id,
          phase_number:  phaseNum,
          day_id:        dayId,
          workout_title: workoutTitle,
          sort_order:    i,
          ...meta,
          ...exercises[i],
        })
        exCount++
      }
    }
    console.log(`  → ${exCount} ejercicios creados`)
    console.log('Seed completado.')
  }
  console.log()

  // ── 12. Seed: exercises_catalog ──────────────────────────────────────────────
  await seedExercisesCatalog()

  // ── 13. Seed: exercise_progressions ─────────────────────────────────────────
  await seedProgressions()

  console.log('✓ Migración completada.')
  console.log(`  Admin: ${PB_URL}/_/`)
}

// ─── Seed exercises_catalog ─────────────────────────────────────────────────
async function seedExercisesCatalog() {
  // Check if catalog already has records (idempotent)
  const existing = await pb.collection('exercises_catalog').getList(1, 1)
  if (existing.totalItems > 0) {
    console.log(`exercises_catalog ya tiene ${existing.totalItems} registros, omitiendo seed.`)
    return
  }

  console.log('Seeding exercises_catalog...')

  // Build a map of day_id → day_type from DAY_META for category inference
  // For exercises that appear in multiple days, use the first occurrence
  const exerciseMap = new Map() // exercise_id → exercise data + category

  for (const [phaseNum, dayId, workoutTitle, exercises] of SEED_WORKOUTS) {
    const meta = DAY_META[dayId]
    for (const ex of exercises) {
      if (!exerciseMap.has(ex.exercise_id)) {
        exerciseMap.set(ex.exercise_id, {
          name:                  ex.exercise_name,
          slug:                  ex.exercise_id,
          muscles:               ex.muscles || '',
          youtube:               ex.youtube || '',
          priority:              ex.priority || '',
          is_timer:              ex.is_timer || false,
          default_timer_seconds: ex.timer_seconds || 0,
          default_sets:          ex.sets || 0,
          default_reps:          ex.reps || '',
          default_rest_seconds:  ex.rest_seconds || 0,
          note:                  ex.note || '',
          category:              meta.day_type || '',
        })
      }
    }
  }

  let count = 0
  for (const [slug, data] of exerciseMap) {
    await pb.collection('exercises_catalog').create(data)
    count++
  }

  console.log(`  → ${count} ejercicios de catálogo creados`)
  console.log('exercises_catalog seed completado.')
  console.log()
}

// ─── Seed exercise_progressions ─────────────────────────────────────────────

const SEED_PROGRESSIONS = [
  // Push chain
  { exercise_id: 'pushup_std',      exercise_name: 'Push-up Estándar',           category: 'push',  difficulty_order: 1, next_exercise_id: 'diamond_pushup', prev_exercise_id: null,             target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'diamond_pushup',  exercise_name: 'Diamond Push-up',            category: 'push',  difficulty_order: 2, next_exercise_id: 'archer_pushup',  prev_exercise_id: 'pushup_std',     target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'archer_pushup',   exercise_name: 'Archer Push-up',             category: 'push',  difficulty_order: 3, next_exercise_id: 'one_arm_prog',   prev_exercise_id: 'diamond_pushup', target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'one_arm_prog',    exercise_name: 'One-Arm Push-up Progresión', category: 'push',  difficulty_order: 4, next_exercise_id: null,             prev_exercise_id: 'archer_pushup',  target_reps_to_advance: 12, sessions_at_target: 3 },

  // Pull chain
  { exercise_id: 'australian_pullup', exercise_name: 'Australian Pull-up',       category: 'pull',  difficulty_order: 1, next_exercise_id: 'neg_pullup',       prev_exercise_id: null,               target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'neg_pullup',        exercise_name: 'Dominadas Negativas',      category: 'pull',  difficulty_order: 2, next_exercise_id: 'pullup_strict',    prev_exercise_id: 'australian_pullup',target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'pullup_strict',     exercise_name: 'Pull-up Estricta',         category: 'pull',  difficulty_order: 3, next_exercise_id: 'weighted_pullup',  prev_exercise_id: 'neg_pullup',       target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'weighted_pullup',   exercise_name: 'Pull-up Lastrada',         category: 'pull',  difficulty_order: 4, next_exercise_id: 'typewriter_pullup',prev_exercise_id: 'pullup_strict',    target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'typewriter_pullup', exercise_name: 'Typewriter Pull-up',       category: 'pull',  difficulty_order: 5, next_exercise_id: null,               prev_exercise_id: 'weighted_pullup',  target_reps_to_advance: 12, sessions_at_target: 3 },

  // Legs chain
  { exercise_id: 'goblet_squat',  exercise_name: 'Sentadilla Goblet',      category: 'legs',  difficulty_order: 1, next_exercise_id: 'reverse_lunge', prev_exercise_id: null,            target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'reverse_lunge', exercise_name: 'Reverse Lunge',          category: 'legs',  difficulty_order: 2, next_exercise_id: 'bulgarian',     prev_exercise_id: 'goblet_squat',  target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'bulgarian',     exercise_name: 'Bulgarian Split Squat',  category: 'legs',  difficulty_order: 3, next_exercise_id: 'pistol_prog',   prev_exercise_id: 'reverse_lunge', target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'pistol_prog',   exercise_name: 'Pistol Squat Progresión',category: 'legs',  difficulty_order: 4, next_exercise_id: 'pistol_free',   prev_exercise_id: 'bulgarian',     target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'pistol_free',   exercise_name: 'Pistol Squat Libre',     category: 'legs',  difficulty_order: 5, next_exercise_id: null,            prev_exercise_id: 'pistol_prog',   target_reps_to_advance: 12, sessions_at_target: 3 },

  // Core chain
  { exercise_id: 'plank',       exercise_name: 'Plank',                 category: 'core',  difficulty_order: 1, next_exercise_id: 'hollow_hold',  prev_exercise_id: null,           target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'hollow_hold', exercise_name: 'Hollow Body Hold',      category: 'core',  difficulty_order: 2, next_exercise_id: 'hollow_rock',  prev_exercise_id: 'plank',        target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'hollow_rock', exercise_name: 'Hollow Body Rock',      category: 'core',  difficulty_order: 3, next_exercise_id: 'lsit_prog',    prev_exercise_id: 'hollow_hold',  target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'lsit_prog',   exercise_name: 'L-sit Progresión',      category: 'core',  difficulty_order: 4, next_exercise_id: 'lsit_full',    prev_exercise_id: 'hollow_rock',  target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'lsit_full',   exercise_name: 'L-sit Completo',        category: 'core',  difficulty_order: 5, next_exercise_id: null,           prev_exercise_id: 'lsit_prog',   target_reps_to_advance: 12, sessions_at_target: 3 },

  // Skills chain
  { exercise_id: 'pike_pushup',    exercise_name: 'Pike Push-up',           category: 'skills', difficulty_order: 1, next_exercise_id: 'pike_elevated',  prev_exercise_id: null,             target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'pike_elevated',  exercise_name: 'Pike Push-up Elevado',   category: 'skills', difficulty_order: 2, next_exercise_id: 'handstand_wall', prev_exercise_id: 'pike_pushup',    target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'handstand_wall', exercise_name: 'Handstand en Pared',     category: 'skills', difficulty_order: 3, next_exercise_id: 'pike_hspu',      prev_exercise_id: 'pike_elevated',  target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'pike_hspu',      exercise_name: 'Pike HSPU',              category: 'skills', difficulty_order: 4, next_exercise_id: 'hspu_wall',      prev_exercise_id: 'handstand_wall', target_reps_to_advance: 12, sessions_at_target: 3 },
  { exercise_id: 'hspu_wall',      exercise_name: 'HSPU en Pared',          category: 'skills', difficulty_order: 5, next_exercise_id: null,             prev_exercise_id: 'pike_hspu',      target_reps_to_advance: 12, sessions_at_target: 3 },
]

async function seedProgressions() {
  // Idempotent: skip if already seeded
  const existing = await pb.collection('exercise_progressions').getList(1, 1)
  if (existing.totalItems > 0) {
    console.log(`exercise_progressions ya tiene ${existing.totalItems} registros, omitiendo seed.`)
    return
  }

  console.log('Seeding exercise_progressions...')

  let count = 0
  for (const prog of SEED_PROGRESSIONS) {
    await pb.collection('exercise_progressions').create(prog)
    count++
  }

  console.log(`  → ${count} progresiones creadas`)
  console.log('exercise_progressions seed completado.')
  console.log()
}

main().catch(err => {
  console.error('Error en la migración:', err.message || err)
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2))
  process.exit(1)
})
