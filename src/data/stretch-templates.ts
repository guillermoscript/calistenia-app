import type { DayType, Exercise } from '../types'

/** Section type for warmup/cooldown exercises */
type Section = 'warmup' | 'cooldown'

function ex(id: string, name: string, sets: number, reps: string, rest: number, muscles: string, note: string, youtube: string, section: Section, opts?: { isTimer?: boolean; timerSeconds?: number }): Exercise {
  return { id, name, sets, reps, rest, muscles, note, youtube, priority: 'med', ...opts, section } as Exercise & { section: Section }
}

// ── Warmup exercises (dynamic) ───────────────────────────────────────────────

const shoulder_dislocates = (s: Section) => ex('shoulder_dislocates', 'Shoulder Dislocates', 2, '12', 30, 'Hombros, movilidad', 'Con toalla o banda. Pasa por encima de la cabeza hacia atrás.', 'shoulder dislocate band tutorial', s)
const scapular_activation = (s: Section) => ex('scapular_activation', 'Scapular Activation', 2, '12', 15, 'Escápulas, espalda alta', 'Protracción y retracción escapular en posición de push-up o colgado.', 'scapular activation push up hang', s)
const thoracic_rotation = (s: Section) => ex('thoracic_rotation', 'Thoracic Rotation', 2, '10/lado', 15, 'Columna torácica, oblicuos', 'En cuadrupedia, mano detrás de la cabeza, rota abriendo el codo al techo.', 'thoracic rotation mobility drill', s)
const arm_circles = (s: Section) => ex('arm_circles', 'Arm Circles', 2, '15 cada dirección', 15, 'Hombros, manguito rotador', 'Calentamiento básico. Pequeños a grandes.', 'arm circles warm up shoulder', s)
const hip_circles = (s: Section) => ex('hip_circles', 'Hip Circles', 2, '10 cada dirección', 15, 'Cadera, glúteos', 'De pie, círculos amplios con la rodilla. Lubrica la articulación de la cadera.', 'hip circles warm up mobility', s)
const leg_swings = (s: Section) => ex('leg_swings', 'Leg Swings', 2, '15/lado', 15, 'Cadera, isquios, aductores', 'Frontal y lateral. Rango progresivo.', 'leg swings warm up dynamic stretching', s)
const ankle_mobility = (s: Section) => ex('ankle_mobility', 'Ankle Mobility Drill', 2, '15/lado', 15, 'Tobillo, soleo', 'Necesario para pistol squat y squat profunda.', 'ankle mobility drill squat depth', s)
const glute_bridge_warmup = (s: Section) => ex('glute_bridge_warmup', 'Glute Bridge Warm-up', 2, '12', 15, 'Glúteos, core', 'Tumbado boca arriba, eleva la cadera apretando glúteos. Activación antes de piernas.', 'glute bridge warm up activation', s)
const cat_cow = (s: Section) => ex('cat_cow', 'Cat-Cow', 2, '10', 15, 'Columna, core', 'En cuadrupedia, alterna entre arquear y redondear la espalda. Movilidad espinal.', 'cat cow stretch spine mobility', s)

// ── Cooldown exercises (static) ──────────────────────────────────────────────

const pectoral_stretch = (s: Section) => ex('pectoral_stretch', 'Pectoral Stretch', 2, '30s', 30, 'Pecho', 'Estiramiento de pecho en marco de puerta o pared. Mantén 30s cada lado.', 'pectoral stretch doorway chest', s, { isTimer: true, timerSeconds: 30 })
const triceps_stretch = (s: Section) => ex('triceps_stretch', 'Triceps Stretch', 2, '30s', 30, 'Tríceps', 'Brazo detrás de la cabeza, empuja el codo con la otra mano. 30s cada lado.', 'triceps stretch overhead', s, { isTimer: true, timerSeconds: 30 })
const lat_stretch = (s: Section) => ex('lat_stretch', 'Lat Stretch', 2, '30s', 30, 'Dorsal, espalda', 'Agárrate a un poste o marco, inclínate alejándote. Siente el estiramiento lateral.', 'lat stretch doorway back', s, { isTimer: true, timerSeconds: 30 })
const biceps_stretch = (s: Section) => ex('biceps_stretch', 'Biceps Stretch', 2, '30s', 30, 'Bíceps', 'Brazo extendido contra pared, gira el torso alejándote. 30s cada lado.', 'biceps stretch wall', s, { isTimer: true, timerSeconds: 30 })
const quad_stretch = (s: Section) => ex('quad_stretch', 'Quad Stretch', 2, '30s', 30, 'Cuádriceps', 'De pie, lleva el talón al glúteo. Mantén equilibrio. 30s cada lado.', 'quad stretch standing', s, { isTimer: true, timerSeconds: 30 })
const hamstring_stretch = (s: Section) => ex('hamstring_stretch', 'Hamstring Stretch', 2, '30s', 30, 'Isquiotibiales', 'Pierna elevada sobre superficie, inclínate hacia adelante. 30s cada lado.', 'hamstring stretch standing', s, { isTimer: true, timerSeconds: 30 })
const hip_flexor_stretch = (s: Section) => ex('hip_flexor_stretch', 'Hip Flexor Stretch', 2, '30s', 30, 'Flexores de cadera, psoas', 'Posición de zancada, rodilla trasera al suelo. Empuja la cadera hacia adelante.', 'hip flexor stretch kneeling psoas', s, { isTimer: true, timerSeconds: 30 })
const calf_stretch = (s: Section) => ex('calf_stretch', 'Calf Stretch', 2, '30s', 30, 'Pantorrillas', 'Contra pared, pierna trasera recta, talón al suelo. 30s cada lado.', 'calf stretch wall standing', s, { isTimer: true, timerSeconds: 30 })
const pike_stretch = (s: Section) => ex('pike_stretch', 'Pike Stretch', 3, '60s', 30, 'Isquios, pantorrillas', 'Sentado, piernas juntas y rectas. Toca los pies.', 'pike stretch hamstring flexibility tutorial', s, { isTimer: true, timerSeconds: 60 })
const deep_breathing = (s: Section) => ex('deep_breathing', 'Deep Breathing', 1, '2 min', 0, 'Diafragma, recuperación', 'Respiración diafragmática profunda. Inhala 4s, mantén 4s, exhala 6s. Vuelta a la calma.', 'deep breathing exercise recovery cooldown', s, { isTimer: true, timerSeconds: 120 })

/**
 * Static map of warmup/cooldown exercise templates per DayType.
 * Each exercise is a full Exercise object ready to be inserted into a workout.
 */
export const stretchTemplates: Record<DayType, { warmup: Exercise[]; cooldown: Exercise[] }> = {
  push: {
    warmup: [shoulder_dislocates('warmup'), scapular_activation('warmup'), thoracic_rotation('warmup')],
    cooldown: [pectoral_stretch('cooldown'), triceps_stretch('cooldown'), deep_breathing('cooldown')],
  },
  pull: {
    warmup: [thoracic_rotation('warmup'), scapular_activation('warmup'), arm_circles('warmup')],
    cooldown: [lat_stretch('cooldown'), biceps_stretch('cooldown'), deep_breathing('cooldown')],
  },
  legs: {
    warmup: [hip_circles('warmup'), leg_swings('warmup'), ankle_mobility('warmup'), glute_bridge_warmup('warmup')],
    cooldown: [quad_stretch('cooldown'), hamstring_stretch('cooldown'), hip_flexor_stretch('cooldown'), calf_stretch('cooldown')],
  },
  lumbar: {
    warmup: [cat_cow('warmup'), hip_circles('warmup'), thoracic_rotation('warmup')],
    cooldown: [pike_stretch('cooldown'), hip_flexor_stretch('cooldown'), deep_breathing('cooldown')],
  },
  full: {
    warmup: [arm_circles('warmup'), hip_circles('warmup'), cat_cow('warmup'), thoracic_rotation('warmup')],
    cooldown: [pectoral_stretch('cooldown'), lat_stretch('cooldown'), hamstring_stretch('cooldown'), deep_breathing('cooldown')],
  },
  cardio: {
    warmup: [ankle_mobility('warmup'), hip_circles('warmup'), leg_swings('warmup')],
    cooldown: [hamstring_stretch('cooldown'), calf_stretch('cooldown'), hip_flexor_stretch('cooldown'), deep_breathing('cooldown')],
  },
  rest: {
    warmup: [],
    cooldown: [],
  },
  yoga: {
    warmup: [],
    cooldown: [],
  },
}
