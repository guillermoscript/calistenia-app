export const PHASES = [
  { id: 1, name: "Base & Activación", weeks: "1-6", color: "#c8f542", bg: "rgba(200,245,66,0.08)" },
  { id: 2, name: "Fuerza Fundamental", weeks: "7-13", color: "#42c8f5", bg: "rgba(66,200,245,0.08)" },
  { id: 3, name: "Intensidad & Skills", weeks: "14-20", color: "#f542c8", bg: "rgba(245,66,200,0.08)" },
  { id: 4, name: "Peak & Consolidación", weeks: "21-26", color: "#f5c842", bg: "rgba(245,200,66,0.08)" },
]

export const WEEK_DAYS = [
  { id: "lun", name: "Lunes",    focus: "Empuje + Core",     type: "push",   color: "#c8f542" },
  { id: "mar", name: "Martes",   focus: "Tirón + Movilidad",  type: "pull",   color: "#42c8f5" },
  { id: "mie", name: "Miércoles",focus: "Lumbar + Stretching",type: "lumbar", color: "#f54242" },
  { id: "jue", name: "Jueves",   focus: "Piernas + Glúteos",  type: "legs",   color: "#f542c8" },
  { id: "vie", name: "Viernes",  focus: "Full Body + Core",   type: "full",   color: "#f5c842" },
  { id: "sab", name: "Sábado",   focus: "Caminata activa",    type: "rest",   color: "#888899" },
  { id: "dom", name: "Domingo",  focus: "Descanso total",     type: "rest",   color: "#888899" },
]

export const WORKOUTS = {
  // ═══════════════════════════════════════ FASE 1 ══════════════════════════════
  p1_lun: {
    phase: 1, day: "lun", title: "Empuje + Core Lumbar",
    exercises: [
      { id: "bird_dog", name: "Bird-Dog", sets: 3, reps: "12/lado", rest: 60, muscles: "Lumbar, core, glúteos", note: "Espalda neutral, mantén 2s arriba. PRIORIDAD ALTA.", youtube: "Bird Dog exercise tutorial", priority: "high" },
      { id: "hollow_hold", name: "Hollow Body Hold", sets: 3, reps: "20-30s", rest: 60, muscles: "Core profundo, TvA", note: "Lumbar PEGADA al suelo. Piernas lo más lejos posible.", youtube: "Hollow body hold tutorial calisthenics", priority: "high", isTimer: true, timerSeconds: 25 },
      { id: "pushup_std", name: "Push-up Estándar", sets: 4, reps: "8-12", rest: 90, muscles: "Pecho, hombros, tríceps", note: "Cuerpo rígido como tabla, codos a 45°, pecho toca el suelo.", youtube: "perfect push up form tutorial", priority: "med" },
      { id: "pike_pushup", name: "Pike Push-up", sets: 3, reps: "8-10", rest: 90, muscles: "Deltoides, tríceps", note: "Caderas arriba en V. Cabeza entre brazos al bajar.", youtube: "pike push up tutorial shoulder", priority: "med" },
      { id: "dips_chair", name: "Dips en Silla", sets: 3, reps: "8-12", rest: 90, muscles: "Tríceps, hombros", note: "Espalda pegada al banco, no más de 90° codos.", youtube: "tricep dips chair tutorial", priority: "low" },
      { id: "plank", name: "Plank", sets: 3, reps: "30-45s", rest: 60, muscles: "Core total", note: "No dejes caer las caderas. Glúteos apretados.", youtube: "perfect plank form tutorial", priority: "high", isTimer: true, timerSeconds: 40 },
    ]
  },
  p1_mar: {
    phase: 1, day: "mar", title: "Tirón + Movilidad",
    exercises: [
      { id: "scap_retract", name: "Retracción Escapular", sets: 3, reps: "10-12", rest: 60, muscles: "Romboides, trapecios", note: "Brazos rectos, solo sube con omóplatos. Clave para postura.", youtube: "scapular retraction dead hang tutorial", priority: "high" },
      { id: "australian_pullup", name: "Australian Pull-up", sets: 4, reps: "8-12", rest: 90, muscles: "Dorsal, bíceps, romboides", note: "Cuerpo rígido, tira el pecho a la barra. Mesa/silla si no tienes barra baja.", youtube: "australian pull up inverted row tutorial", priority: "high" },
      { id: "neg_pullup", name: "Dominadas Negativas", sets: 3, reps: "5 (5s bajada)", rest: 120, muscles: "Dorsal, bíceps", note: "Sube con silla, baja MUY lento 5 segundos. Base para dominadas.", youtube: "negative pull up tutorial beginners", priority: "med" },
      { id: "face_pull", name: "Face Pull (banda/toalla)", sets: 3, reps: "12-15", rest: 60, muscles: "Deltoides posterior, manguito", note: "Jala hacia la cara separando codos. Clave anti-lordosis.", youtube: "face pull band tutorial posture", priority: "med" },
      { id: "cat_cow", name: "Cat-Cow", sets: 2, reps: "12 lentos", rest: 30, muscles: "Columna, lumbar", note: "Lento y controlado. Siente cada vértebra.", youtube: "cat cow yoga stretch spine", priority: "high" },
      { id: "superman", name: "Superman Hold", sets: 3, reps: "10 (3s arriba)", rest: 60, muscles: "Erectores, glúteos, lumbar", note: "Fortalece cadena posterior. Esencial para tu lumbar.", youtube: "superman exercise back extension tutorial", priority: "high" },
    ]
  },
  p1_mie: {
    phase: 1, day: "mie", title: "Lumbar + Stretching Activo",
    exercises: [
      { id: "hip_flexor", name: "Hip Flexor Stretch (Psoas)", sets: 3, reps: "60s/lado", rest: 30, muscles: "Psoas, ilíaco", note: "El psoas apretado ES la causa de tu dolor. 60s mínimo cada lado.", youtube: "hip flexor stretch psoas tight tutorial", priority: "high", isTimer: true, timerSeconds: 60 },
      { id: "pigeon", name: "Pigeon Pose", sets: 2, reps: "90s/lado", rest: 30, muscles: "Glúteo, piriforme", note: "Piriforme apretado comprime nervio ciático → dolor lumbar.", youtube: "pigeon pose tutorial piriformis stretch", priority: "high", isTimer: true, timerSeconds: 90 },
      { id: "childs_pose", name: "Child's Pose con Tracción", sets: 3, reps: "60s", rest: 30, muscles: "Lumbar, dorsal, caderas", note: "Brazos extendidos al frente. Deja que la gravedad descomprima la columna.", youtube: "child pose yoga extended arms spine", priority: "high", isTimer: true, timerSeconds: 60 },
      { id: "glute_bridge", name: "Glute Bridge", sets: 4, reps: "15", rest: 60, muscles: "Glúteos, isquios, lumbar", note: "Glúteos débiles sobrecargan la lumbar. Aprieta fuerte arriba, 1s pausa.", youtube: "glute bridge tutorial form", priority: "high" },
      { id: "dead_bug", name: "Dead Bug", sets: 3, reps: "10/lado", rest: 60, muscles: "Core profundo, TvA", note: "Lumbar PEGADA al suelo todo el tiempo. Lento y controlado.", youtube: "dead bug exercise core tutorial", priority: "med" },
      { id: "thoracic_rot", name: "Thoracic Rotation", sets: 3, reps: "10/lado", rest: 30, muscles: "Columna torácica, oblicuos", note: "Tumbado de lado, rodillas dobladas, rota solo el torso. Libera presión lumbar.", youtube: "thoracic rotation stretch tutorial spine", priority: "med" },
      { id: "forward_fold", name: "Seated Forward Fold", sets: 3, reps: "60s", rest: 30, muscles: "Isquiotibiales, lumbar", note: "Isquios acortados = postura cifótica = dolor lumbar.", youtube: "seated forward fold hamstring stretch tutorial", priority: "med", isTimer: true, timerSeconds: 60 },
    ]
  },
  p1_jue: {
    phase: 1, day: "jue", title: "Piernas + Glúteos",
    exercises: [
      { id: "glute_bridge_uni", name: "Glute Bridge Unilateral", sets: 3, reps: "12/lado", rest: 60, muscles: "Glúteo, isquios", note: "Corrige desequilibrios L/D que causan dolor lumbar.", youtube: "single leg glute bridge tutorial", priority: "high" },
      { id: "goblet_squat", name: "Sentadilla Goblet", sets: 4, reps: "12-15", rest: 90, muscles: "Cuádriceps, glúteos, core", note: "Espalda recta, rodillas sobre puntas de pies, 90°.", youtube: "goblet squat bodyweight tutorial form", priority: "high" },
      { id: "reverse_lunge", name: "Reverse Lunge", sets: 3, reps: "10/lado", rest: 90, muscles: "Cuádriceps, glúteos, isquios", note: "Paso atrás. Más seguro para rodillas que el lunge frontal.", youtube: "reverse lunge tutorial form", priority: "med" },
      { id: "good_morning", name: "Good Morning (sin peso)", sets: 3, reps: "12", rest: 60, muscles: "Isquios, lumbar, glúteos", note: "Pies al ancho de hombros, inclina el torso con espalda recta.", youtube: "good morning exercise bodyweight tutorial", priority: "med" },
      { id: "calf_raise", name: "Calf Raises", sets: 3, reps: "20", rest: 45, muscles: "Pantorrillas, soleo", note: "Lento y con rango completo.", youtube: "calf raise tutorial form", priority: "low" },
      { id: "wall_sit", name: "Wall Sit", sets: 3, reps: "45s", rest: 60, muscles: "Cuádriceps, core", note: "Espalda plana contra la pared, 90° rodillas.", youtube: "wall sit exercise tutorial", priority: "med", isTimer: true, timerSeconds: 45 },
    ]
  },
  p1_vie: {
    phase: 1, day: "vie", title: "Full Body + Core Total",
    exercises: [
      { id: "archer_pushup", name: "Archer Push-up (Regresión)", sets: 3, reps: "6/lado", rest: 90, muscles: "Pecho unilateral", note: "Brazo guía extendido, carga en el otro. Progresión hacia one-arm.", youtube: "archer push up tutorial progression", priority: "high" },
      { id: "pullup_neg2", name: "Pull-up Asistida o Negativas", sets: 4, reps: "5-8", rest: 120, muscles: "Dorsal, bíceps", note: "Usa banda elástica si no puedes hacer pull-up completa.", youtube: "assisted pull up band tutorial", priority: "high" },
      { id: "jump_squat", name: "Jump Squat", sets: 3, reps: "10", rest: 60, muscles: "Piernas, explosividad", note: "Aterriza suave con rodillas dobladas. Solo si no hay dolor.", youtube: "jump squat tutorial plyometric", priority: "med" },
      { id: "lsit_prog", name: "L-sit Progresión", sets: 3, reps: "15-20s", rest: 90, muscles: "Core, flexores de cadera", note: "Empieza apoyando talones en suelo, luego levanta una pierna.", youtube: "L-sit progression tutorial beginners", priority: "high", isTimer: true, timerSeconds: 20 },
      { id: "side_plank", name: "Side Plank", sets: 3, reps: "30s/lado", rest: 60, muscles: "Oblicuos, cuadrado lumbar", note: "Cuerpo recto como tabla.", youtube: "side plank tutorial form", priority: "med", isTimer: true, timerSeconds: 30 },
      { id: "burpees", name: "Burpees", sets: 3, reps: "8-10", rest: 90, muscles: "Full body, cardio", note: "Controlados. Sustituir por mountain climbers si hay dolor.", youtube: "burpee tutorial form proper", priority: "low" },
    ]
  },
  // ═══════════════════════════════════════ FASE 2 ══════════════════════════════
  p2_lun: {
    phase: 2, day: "lun", title: "Empuje Avanzado",
    exercises: [
      { id: "hollow_rock", name: "Hollow Body Rock", sets: 3, reps: "15-20", rest: 60, muscles: "Core profundo", note: "Evolución del Hollow Hold estático. Balanceo controlado.", youtube: "hollow body rock calisthenics tutorial", priority: "high" },
      { id: "diamond_pushup", name: "Diamond Push-up", sets: 4, reps: "8-12", rest: 90, muscles: "Tríceps, pecho interno", note: "Manos en diamante bajo el esternón. Codos juntos al bajar.", youtube: "diamond push up triceps tutorial", priority: "high" },
      { id: "wide_pushup", name: "Wide Push-up", sets: 3, reps: "10-15", rest: 90, muscles: "Pecho externo, deltoides", note: "Manos más anchas que hombros.", youtube: "wide push up chest tutorial", priority: "med" },
      { id: "pike_elevated", name: "Pike Push-up Elevado", sets: 4, reps: "8-10", rest: 90, muscles: "Deltoides, tríceps", note: "Pies en silla. Más carga en hombros. Evolución hacia HSPU.", youtube: "elevated pike push up shoulder press tutorial", priority: "med" },
      { id: "dips_parallel", name: "Dips Paralelas (2 sillas)", sets: 4, reps: "8-12", rest: 90, muscles: "Tríceps, pecho bajo", note: "Rango completo. No dejes hombros subir.", youtube: "parallel bar dips chairs tutorial", priority: "high" },
      { id: "plank_shoulder", name: "Plank Toque de Hombros", sets: 3, reps: "12/lado", rest: 60, muscles: "Core antirotación", note: "No muevas las caderas al tocar el hombro opuesto.", youtube: "plank shoulder tap anti rotation core tutorial", priority: "high" },
    ]
  },
  p2_mar: {
    phase: 2, day: "mar", title: "Tirón Avanzado",
    exercises: [
      { id: "pullup_strict", name: "Pull-up Estricto", sets: 5, reps: "máx (obj 8-12)", rest: 120, muscles: "Dorsal ancho, bíceps", note: "Sin kipping. Pausa 1s arriba.", youtube: "strict pull up form tutorial", priority: "high" },
      { id: "chinup", name: "Chin-up (agarre supino)", sets: 4, reps: "máx", rest: 120, muscles: "Bíceps, dorsal", note: "Más fácil que pull-up. Úsalo para acumular volumen.", youtube: "chin up supinated grip tutorial", priority: "high" },
      { id: "renegade_row", name: "Renegade Row", sets: 3, reps: "10/lado", rest: 90, muscles: "Dorsal, core antirotación", note: "Desde posición de push-up, jala alternando cada lado.", youtube: "renegade row tutorial bodyweight", priority: "med" },
      { id: "inverted_row_pause", name: "Inverted Row con Pausa", sets: 4, reps: "10-12", rest: 90, muscles: "Romboides, trapecio medio", note: "2s de pausa arriba. Clave para postura de programador.", youtube: "inverted row pause tutorial", priority: "high" },
      { id: "pull_apart", name: "Towel Pull Apart", sets: 3, reps: "15", rest: 60, muscles: "Deltoides posterior", note: "Brazos a la altura de los hombros, separa completamente.", youtube: "band pull apart posterior deltoid tutorial", priority: "med" },
    ]
  },
  p2_mie: {
    phase: 2, day: "mie", title: "Lumbar Avanzado",
    exercises: [
      { id: "single_rdl", name: "Single Leg RDL", sets: 3, reps: "10/lado", rest: 60, muscles: "Isquios, glúteo, lumbar", note: "Bisagra de cadera perfecta. Espalda neutral todo el tiempo.", youtube: "single leg RDL bodyweight tutorial", priority: "high" },
      { id: "glute_bridge_pause", name: "Glute Bridge con Pausa (3s)", sets: 4, reps: "15", rest: 60, muscles: "Glúteos, isquios", note: "Pausa isométrica 3s arriba. Si es fácil: unilateral.", youtube: "glute bridge pause isometric tutorial", priority: "high" },
      { id: "dead_bug_adv", name: "Dead Bug Avanzado", sets: 3, reps: "12/lado", rest: 60, muscles: "Core, TvA", note: "Piernas completamente extendidas. Más difícil mantener lumbar pegada.", youtube: "dead bug advanced tutorial extended legs", priority: "med" },
      { id: "hip_flexor2", name: "Stretching Psoas", sets: 2, reps: "90s/lado", rest: 30, muscles: "Psoas, ilíaco", note: "Siempre presente. Nunca saltar este.", youtube: "deep hip flexor stretch psoas", priority: "high", isTimer: true, timerSeconds: 90 },
      { id: "thoracic_ext", name: "Thoracic Extension (toalla)", sets: 3, reps: "60s", rest: 30, muscles: "Columna torácica", note: "Toalla enrollada a altura torácica. Abre el pecho hacia el techo.", youtube: "thoracic extension foam roller towel tutorial", priority: "med", isTimer: true, timerSeconds: 60 },
      { id: "worlds_stretch", name: "World's Greatest Stretch", sets: 3, reps: "6/lado", rest: 30, muscles: "Full body, cadena posterior", note: "El estiramiento más completo que existe.", youtube: "world greatest stretch tutorial", priority: "low" },
    ]
  },
  p2_jue: {
    phase: 2, day: "jue", title: "Piernas Avanzadas",
    exercises: [
      { id: "bulgarian", name: "Bulgarian Split Squat", sets: 4, reps: "10/lado", rest: 120, muscles: "Cuádriceps, glúteo, isquios", note: "Pie trasero en banco/silla. El ejercicio de pierna más efectivo en calistenia.", youtube: "bulgarian split squat tutorial form", priority: "high" },
      { id: "nordic_curl", name: "Nordic Curl (Regresión)", sets: 3, reps: "6-8", rest: 120, muscles: "Isquiotibiales", note: "Ancla los pies bajo el sofá. Previene lesiones y fortalece cadena posterior.", youtube: "nordic curl tutorial hamstrings beginners", priority: "high" },
      { id: "squat_pause", name: "Squat con Pausa (3s)", sets: 4, reps: "10", rest: 90, muscles: "Cuádriceps, glúteos", note: "La pausa elimina el rebote y aumenta fuerza real.", youtube: "pause squat bodyweight tutorial", priority: "med" },
      { id: "step_up", name: "Step-up Explosivo", sets: 3, reps: "10/lado", rest: 90, muscles: "Glúteo, cuádriceps", note: "Sube fuerte, baja controlado. Usa escalón o silla sólida.", youtube: "explosive step up tutorial plyometric", priority: "med" },
      { id: "calf_uni", name: "Calf Raise Unilateral", sets: 3, reps: "15/lado", rest: 45, muscles: "Gastrocnemio, soleo", note: "Rango completo, sin rebote.", youtube: "single leg calf raise tutorial", priority: "low" },
    ]
  },
  p2_vie: {
    phase: 2, day: "vie", title: "Full Body Intensidad",
    exercises: [
      { id: "archer2", name: "Archer Push-up", sets: 4, reps: "8/lado", rest: 90, muscles: "Pecho unilateral", note: "Brazo guía más extendido cada semana. Progresión hacia one-arm.", youtube: "archer push up advanced tutorial", priority: "high" },
      { id: "lsit_full", name: "L-sit Paralelas/Sillas", sets: 4, reps: "15-25s", rest: 90, muscles: "Core, flexores cadera, hombros", note: "Piernas rectas si puedes. Si no, rodillas dobladas.", youtube: "L-sit on chairs tutorial progression", priority: "high", isTimer: true, timerSeconds: 20 },
      { id: "muscleup_neg", name: "Muscle-up Negativo", sets: 3, reps: "5 (5s)", rest: 120, muscles: "Full tirón + empuje", note: "Súbete con silla, baja muy lento pasando la transición.", youtube: "muscle up negative tutorial progression", priority: "high" },
      { id: "pistol_prog", name: "Pistol Squat Progresión", sets: 3, reps: "8/lado", rest: 90, muscles: "Cuádriceps, glúteo, equilibrio", note: "Empieza sentándote en silla con una pierna levantada.", youtube: "pistol squat progression tutorial beginners", priority: "med" },
      { id: "hollow_arch", name: "Hollow-to-Arch Swing", sets: 3, reps: "10", rest: 60, muscles: "Core total, dorsal, glúteos", note: "En barra, oscila entre posición hollow y arch de forma controlada.", youtube: "hollow arch swing bar calisthenics tutorial", priority: "med" },
    ]
  },
  // ═══════════════════════════════════════ FASE 3 ══════════════════════════════
  p3_lun: {
    phase: 3, day: "lun", title: "Empuje + Handstand",
    exercises: [
      { id: "handstand_wall", name: "Handstand contra Pared", sets: 3, reps: "30-60s", rest: 120, muscles: "Hombros, core, equilibrio", note: "Manos a 10-15cm de la pared. Cuerpo recto, no arquear la espalda.", youtube: "handstand against wall tutorial beginner", priority: "high", isTimer: true, timerSeconds: 45 },
      { id: "pike_hspu", name: "Pike HSPU", sets: 4, reps: "6-10", rest: 120, muscles: "Deltoides, tríceps", note: "Pies en silla alta. Objetivo: handstand push-up completo.", youtube: "pike handstand push up tutorial", priority: "high" },
      { id: "one_arm_prog", name: "One-Arm Push-up Progresión", sets: 4, reps: "5/lado", rest: 120, muscles: "Pecho unilateral total", note: "Desde rodillas o con mano elevada en pelota.", youtube: "one arm push up progression tutorial", priority: "high" },
      { id: "pseudo_planche", name: "Pseudo Planche Push-up", sets: 3, reps: "6-8", rest: 120, muscles: "Hombros anteriores, pecho", note: "Dedos hacia los pies, cuerpo ligeramente hacia adelante.", youtube: "pseudo planche push up tutorial", priority: "med" },
      { id: "planche_lean", name: "Planche Lean", sets: 4, reps: "20-30s", rest: 90, muscles: "Hombros, wrist, core", note: "Inclínate hacia adelante sobre manos. Prepara la planche.", youtube: "planche lean tutorial progression", priority: "med", isTimer: true, timerSeconds: 25 },
    ]
  },
  p3_mar: {
    phase: 3, day: "mar", title: "Tirón + Skills",
    exercises: [
      { id: "weighted_pullup", name: "Pull-up con Mochila", sets: 5, reps: "6-8", rest: 180, muscles: "Dorsal, bíceps", note: "Mochila con 5-10kg. Si tienes dominadas sólidas.", youtube: "weighted pull up backpack tutorial", priority: "high" },
      { id: "muscleup_real", name: "Muscle-up", sets: 3, reps: "3-5 (o negativas)", rest: 180, muscles: "Pull + Push completo", note: "Si aún no llegas: 5 negativas muy lentas.", youtube: "muscle up tutorial step by step", priority: "high" },
      { id: "front_lever_tuck", name: "Front Lever Tucked", sets: 4, reps: "10-20s", rest: 120, muscles: "Dorsal, core, escápulas", note: "Rodillas al pecho. Cuerpo horizontal. Muy exigente.", youtube: "front lever tuck tutorial progression", priority: "high", isTimer: true, timerSeconds: 15 },
      { id: "typewriter_pullup", name: "Typewriter Pull-up", sets: 3, reps: "6 totales", rest: 120, muscles: "Dorsal unilateral", note: "Sube al centro, desliza a un lado, al otro, baja.", youtube: "typewriter pull up tutorial advanced", priority: "med" },
    ]
  },
  p3_mie: {
    phase: 3, day: "mie", title: "Lumbar Mantenimiento",
    exercises: [
      { id: "hip_flexor_deep", name: "Hip Flexor 90/90", sets: 3, reps: "90s/lado", rest: 30, muscles: "Psoas, cápsula de cadera", note: "Posición 90/90 en el suelo. Más profundo que el básico.", youtube: "90 90 hip flexor stretch tutorial", priority: "high", isTimer: true, timerSeconds: 90 },
      { id: "jefferson_curl", name: "Jefferson Curl (muy lento)", sets: 3, reps: "8", rest: 60, muscles: "Columna, isquios, lumbar", note: "Enrolla la columna vertebra por vertebra. MUY lento.", youtube: "jefferson curl tutorial spine mobility", priority: "med" },
      { id: "cossack_squat", name: "Cossack Squat", sets: 3, reps: "8/lado", rest: 60, muscles: "Aductores, cadera, movilidad", note: "Sentadilla lateral profunda. Trabaja movilidad de cadera y lumbar.", youtube: "cossack squat tutorial mobility", priority: "med" },
      { id: "glute_bridge_march", name: "Glute Bridge March", sets: 3, reps: "12/lado", rest: 60, muscles: "Glúteos, core estabilizador", note: "Desde bridge, levanta alternando rodillas al pecho.", youtube: "glute bridge march tutorial", priority: "high" },
      { id: "thoracic_mobility", name: "Thoracic Mobility Full", sets: 2, reps: "10 min total", rest: 0, muscles: "Columna torácica completa", note: "Rotaciones, extensiones, foam roller. Rutina completa.", youtube: "thoracic spine mobility routine programmer", priority: "high" },
    ]
  },
  p3_jue: {
    phase: 3, day: "jue", title: "Piernas + Pistol Squat",
    exercises: [
      { id: "pistol_free", name: "Pistol Squat Libre", sets: 4, reps: "5/lado", rest: 120, muscles: "Cuádriceps, glúteo, equilibrio", note: "Sin apoyo. Necesita fuerza, movilidad de tobillo y equilibrio.", youtube: "pistol squat free tutorial", priority: "high" },
      { id: "nordic_adv", name: "Nordic Curl Completo", sets: 3, reps: "5-8", rest: 120, muscles: "Isquiotibiales", note: "Rango completo al suelo. Usa las manos al final si necesario.", youtube: "nordic hamstring curl full tutorial", priority: "high" },
      { id: "bulgarian_adv", name: "Bulgarian Split + Salto", sets: 3, reps: "8/lado", rest: 120, muscles: "Explosividad piernas", note: "Salta al cambiar de pierna. Alta intensidad.", youtube: "bulgarian split squat jump plyometric tutorial", priority: "med" },
      { id: "shrimp_squat", name: "Shrimp Squat Progresión", sets: 3, reps: "6/lado", rest: 90, muscles: "Cuádriceps, equilibrio", note: "Pie trasero en la mano detrás. Más difícil que el pistol.", youtube: "shrimp squat tutorial progression", priority: "med" },
    ]
  },
  p3_vie: {
    phase: 3, day: "vie", title: "Skills Day",
    exercises: [
      { id: "lsit_30s", name: "L-sit 30s", sets: 5, reps: "30s", rest: 120, muscles: "Core, flexores, hombros", note: "Objetivo de la fase: 30s continuos con piernas rectas.", youtube: "L-sit 30 seconds tutorial progression", priority: "high", isTimer: true, timerSeconds: 30 },
      { id: "handstand_free", name: "Handstand Libre (intentos)", sets: "múltiples", reps: "intentos 5-15s", rest: 60, muscles: "Equilibrio, hombros, core", note: "Practica el balance libre. Múltiples intentos con descanso.", youtube: "freestanding handstand tutorial balance", priority: "high" },
      { id: "human_flag_prog", name: "Human Flag Progresión", sets: 3, reps: "5-10s", rest: 120, muscles: "Oblicuos, hombros, dorsal", note: "Empieza con tucked. Uno de los skills más impresionantes.", youtube: "human flag progression tutorial beginners", priority: "med", isTimer: true, timerSeconds: 8 },
      { id: "front_lever_single", name: "Front Lever Single Leg", sets: 3, reps: "10-15s", rest: 120, muscles: "Dorsal, core", note: "Una pierna extendida. Progresión al front lever completo.", youtube: "front lever single leg tutorial progression", priority: "med", isTimer: true, timerSeconds: 12 },
    ]
  },
  // ═══════════════════════════════════════ FASE 4 ══════════════════════════════
  p4_lun: {
    phase: 4, day: "lun", title: "Peak Push + Handstand",
    exercises: [
      { id: "hspu_wall", name: "Handstand Push-up (pared)", sets: 5, reps: "5-8", rest: 180, muscles: "Deltoides, tríceps, core", note: "Handstand contra la pared, baja la cabeza al suelo. Elite.", youtube: "handstand push up wall tutorial", priority: "high" },
      { id: "one_arm_actual", name: "One-Arm Push-up", sets: 4, reps: "5/lado", rest: 120, muscles: "Pecho unilateral total", note: "Si no llegas: archer push-up máximo inclinado.", youtube: "one arm push up tutorial full", priority: "high" },
      { id: "planche_tuck", name: "Tuck Planche", sets: 4, reps: "5-15s", rest: 120, muscles: "Hombros anteriores, core", note: "Rodillas al pecho, cuerpo horizontal. Extremadamente difícil.", youtube: "tuck planche tutorial progression", priority: "high", isTimer: true, timerSeconds: 10 },
      { id: "ring_dip_prog", name: "Ring Dips (o Dips con peso)", sets: 4, reps: "8-10", rest: 120, muscles: "Tríceps, pecho, estabilizadores", note: "Anillas o mochila. Nivel avanzado.", youtube: "ring dips tutorial beginner progression", priority: "med" },
    ]
  },
  p4_mar: {
    phase: 4, day: "mar", title: "Peak Pull + Skills",
    exercises: [
      { id: "front_lever_full", name: "Front Lever Completo", sets: 4, reps: "5-10s", rest: 180, muscles: "Dorsal, core, escápulas", note: "Cuerpo completamente horizontal. El skill de tirón más impresionante.", youtube: "front lever full tutorial", priority: "high", isTimer: true, timerSeconds: 8 },
      { id: "one_arm_pullup_prog", name: "One-Arm Pull-up Progresión", sets: 4, reps: "3-5/lado", rest: 180, muscles: "Dorsal unilateral", note: "Con banda o desde medio agarre. Largo camino, pero empieza aquí.", youtube: "one arm pull up progression tutorial", priority: "high" },
      { id: "muscleup_flow", name: "Muscle-up x5 Flow", sets: 4, reps: "5 seguidos", rest: 180, muscles: "Full tirón + empuje", note: "5 seguidos sin soltar la barra. Peak de tirón.", youtube: "muscle up 5 in a row tutorial", priority: "high" },
      { id: "back_lever", name: "Back Lever Progresión", sets: 3, reps: "5-15s", rest: 120, muscles: "Hombros, pecho, core", note: "Empieza con tucked back lever.", youtube: "back lever progression tutorial beginners", priority: "med", isTimer: true, timerSeconds: 10 },
    ]
  },
  p4_mie: {
    phase: 4, day: "mie", title: "Lumbar Elite + Movilidad",
    exercises: [
      { id: "yoga_flow_lumbar", name: "Yoga Flow Lumbar (15 min)", sets: 1, reps: "15 min", rest: 0, muscles: "Columna completa, caderas", note: "Rutina de yoga específica para lumbar. Sigue un video completo.", youtube: "yoga flow lower back pain relief 15 minutes", priority: "high" },
      { id: "jefferson_adv", name: "Jefferson Curl + Peso", sets: 3, reps: "8 (con 2-5kg)", rest: 60, muscles: "Columna, isquios", note: "Ahora con ligero peso. Máxima movilidad espinal.", youtube: "jefferson curl weighted tutorial", priority: "med" },
      { id: "deep_hip_mobility", name: "Hip Mobility Full Routine", sets: 1, reps: "10 min", rest: 0, muscles: "Cadera completa, lumbar", note: "Rutina completa de movilidad de cadera. Sigue un video.", youtube: "hip mobility full routine 10 minutes", priority: "high" },
      { id: "glute_activation_peak", name: "Glute Activation Peak", sets: 4, reps: "20", rest: 45, muscles: "Glúteos, isquios", note: "X-band walk, clam shell, frog pump. Activación completa.", youtube: "glute activation routine complete tutorial", priority: "high" },
    ]
  },
  p4_jue: {
    phase: 4, day: "jue", title: "Peak Legs",
    exercises: [
      { id: "pistol_vol", name: "Pistol Squat Volumen", sets: 5, reps: "8/lado", rest: 90, muscles: "Cuádriceps, glúteo", note: "5 series de 8. Máximo volumen de pierna en calistenia.", youtube: "pistol squat volume training tutorial", priority: "high" },
      { id: "nordic_full", name: "Nordic Curl Full", sets: 4, reps: "8-10", rest: 120, muscles: "Isquiotibiales", note: "Sin usar las manos al final. Fuerza excéntrica máxima.", youtube: "nordic hamstring curl advanced", priority: "high" },
      { id: "shrimp_full", name: "Shrimp Squat Completo", sets: 3, reps: "8/lado", rest: 90, muscles: "Cuádriceps, tobillo, equilibrio", note: "Rodilla trasera toca el suelo suavemente.", youtube: "shrimp squat full tutorial", priority: "med" },
      { id: "box_jump", name: "Box Jump (silla sólida)", sets: 4, reps: "8", rest: 90, muscles: "Explosividad total", note: "Salta sobre una silla sólida o escalón. Aterriza suave.", youtube: "box jump tutorial plyometric form", priority: "med" },
    ]
  },
  p4_vie: {
    phase: 4, day: "vie", title: "Skills Peak Day",
    exercises: [
      { id: "skill_complex", name: "Skill Complex (elige 3 skills)", sets: 3, reps: "según skill", rest: 180, muscles: "Variable", note: "Escoge tus 3 skills favoritos y practica. Handstand, L-sit, muscle-up, front lever.", youtube: "calisthenics skills complex advanced", priority: "high" },
      { id: "lsit_45", name: "L-sit 45s Objetivo", sets: 4, reps: "máx (obj 45s)", rest: 120, muscles: "Core, flexores, hombros", note: "Objetivo final del programa. 45 segundos continuos.", youtube: "L-sit 45 seconds tutorial", priority: "high", isTimer: true, timerSeconds: 45 },
      { id: "handstand_60", name: "Handstand 60s Libre", sets: "intentos", reps: "obj 60s libre", rest: 60, muscles: "Equilibrio total", note: "Objetivo: 60s de handstand libre al terminar los 6 meses.", youtube: "freestanding handstand 60 seconds tutorial", priority: "high" },
      { id: "strength_test", name: "Test de Fuerza Mensual", sets: 1, reps: "máx en todo", rest: 300, muscles: "Full body", note: "Último viernes del mes: pull-up máx, push-up máx, L-sit tiempo, pistol squat máx. Anota y compara.", youtube: "calisthenics strength test benchmark", priority: "high" },
    ]
  },
}

export const getWorkout = (phase, day) => WORKOUTS[`p${phase}_${day}`] || null
