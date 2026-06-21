#!/usr/bin/env node
/**
 * Build a comprehensive, deduplicated exercise catalog.
 *
 * DEFAULT (no flag) = OFFLINE MERGE:
 *   - Reads existing packages/core/data/exercise-catalog.json as base
 *   - Merges seeds/exercises/*.json using seeds/exercises/_id-map.json
 *   - Enriches existing entries where a seed maps to their id
 *   - Adds new entries for seeds that have no existing id
 *   - Writes identical JSON to all 3 catalog copies
 *
 * --refresh-wger flag = ONLINE: fetches from wger API (old behavior), THEN merges seeds.
 *
 * Translatable fields (name, muscles, note, description) are stored as
 * i18n JSON objects: { es: "...", en: "..." }.
 *
 * Usage:
 *   node scripts/build-exercise-catalog.mjs            # OFFLINE merge (default)
 *   node scripts/build-exercise-catalog.mjs --refresh-wger  # online wger fetch + merge
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
// FROZEN pre-merge base (local + wger layer). OFFLINE merge reads this — never
// the merged output — so re-running the pipeline from a clean checkout is
// idempotent. `--refresh-wger` rewrites this snapshot from the wger fetch.
const BASE_PATH = join(ROOT, 'packages/core/data/exercise-catalog.base.json')
const SEEDS_DIR = join(ROOT, 'seeds/exercises')
const ID_MAP_PATH = join(SEEDS_DIR, '_id-map.json')

// 3 output copies — must always be byte-identical
const OUTPUT_PATHS = [
  join(ROOT, 'packages/core/data/exercise-catalog.json'),
  join(ROOT, 'mcp-server/data/exercise-catalog.json'),
  join(ROOT, 'mcp-server/src/data/exercise-catalog.json'),
]

const WGER_BASE = 'https://wger.de/api/v2'

// Seed file -> catalog category map
const SEED_CAT_MAP = {
  'push': 'push',
  'pull': 'pull',
  'legs': 'legs',
  'core': 'core',
  'skills': 'skill',
  'mobility': 'movilidad',
  'glutes-lower-back': 'lumbar',
  'cardio': 'full',
}

// Deterministic seed file order
const SEED_FILES = Object.keys(SEED_CAT_MAP).sort()

// ── Equipment mapping (seed English keys → canonical Spanish ids) ─────────────
const EQUIP_MAP = {
  'jump_rope': 'ninguno',        // LOSSY — jump_rope has no canonical id
  'pull_up_bar': 'barra_dominadas',
  'bench': 'banco',
  'rings': 'anillas',
  'resistance_band': 'banda_elastica',
  'weighted_vest': 'lastre',
  'step_box': 'escalon',
  'towel': 'toalla',
  'wall': 'pared',
  'parallel_bars': 'paralelas',
  // canonical keys pass through unchanged
  'ninguno': 'ninguno',
  'barra_dominadas': 'barra_dominadas',
  'paralelas': 'paralelas',
  'anillas': 'anillas',
  'banda_elastica': 'banda_elastica',
  'lastre': 'lastre',
  'fitball': 'fitball',
  'rueda_abdominal': 'rueda_abdominal',
  'trx': 'trx',
  'banco': 'banco',
  'kettlebell': 'kettlebell',
  'pared': 'pared',
  'toalla': 'toalla',
  'escalon': 'escalon',
}

const CANONICAL_EQUIPMENT = new Set([
  'ninguno','barra_dominadas','paralelas','anillas','banda_elastica',
  'lastre','fitball','rueda_abdominal','trx','banco','kettlebell',
  'pared','toalla','escalon',
])

const LOSSY_MAP_LOG = [] // track lossy mappings

function mapEquipment(equipArr) {
  if (!Array.isArray(equipArr) || equipArr.length === 0) return ['ninguno']
  const result = new Set()
  for (const e of equipArr) {
    if (EQUIP_MAP[e] !== undefined) {
      if (e === 'jump_rope') {
        LOSSY_MAP_LOG.push(`jump_rope → ninguno (lossy: no canonical id for jump rope)`)
      }
      result.add(EQUIP_MAP[e])
    } else if (CANONICAL_EQUIPMENT.has(e)) {
      result.add(e)
    } else {
      console.warn(`  WARN: Unknown equipment key "${e}" — keeping as-is`)
      result.add(e)
    }
  }
  if (result.size === 0) return ['ninguno']
  return [...result]
}

function mapDifficulty(dl) {
  const valid = new Set(['beginner', 'intermediate', 'advanced'])
  if (!valid.has(dl)) {
    throw new Error(`Invalid difficulty_level "${dl}" — must be beginner|intermediate|advanced`)
  }
  return dl
}

function youtubeUrl(name) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' exercise tutorial')}`
}

/** Extract plain string from an i18n field (or pass through plain strings). */
function str(field, lang = 'es') {
  if (!field) return ''
  if (typeof field === 'string') return field
  return field[lang] ?? field['es'] ?? Object.values(field)[0] ?? ''
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchJSON(url, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    return await res.json()
  } catch { clearTimeout(timeout); return null }
}

// ── wger mappings ─────────────────────────────────────────────────────────────
const WGER_MUSCLE_MAP = {
  1: 'Biceps', 2: 'Deltoides', 3: 'Pecho', 4: 'Trapecio',
  5: 'Pecho', 6: 'Core', 7: 'Pantorrillas', 8: 'Gluteos',
  9: 'Dorsal', 10: 'Dorsal', 11: 'Biceps', 12: 'Core',
  13: 'Pantorrillas', 14: 'Cuadriceps', 15: 'Isquios',
}

const WGER_EQUIP_MAP = {
  1: 'lastre', 3: 'lastre', 4: 'ninguno', 5: 'fitball',
  6: 'barra_dominadas', 7: 'ninguno', 8: 'banco', 9: 'banco', 10: 'kettlebell',
}

const SEARCH_TERMS = [
  'push up', 'push-up', 'dip', 'handstand push', 'pike push', 'diamond push',
  'archer push', 'decline push', 'incline push', 'clap push', 'wide push',
  'hindu push', 'one arm push', 'pseudo planche', 'sphinx',
  'pull up', 'pull-up', 'chin up', 'row', 'inverted row', 'australian',
  'muscle up', 'face pull', 'typewriter', 'commando', 'towel pull',
  'squat', 'lunge', 'pistol', 'bulgarian', 'nordic curl', 'calf raise',
  'step up', 'wall sit', 'box jump', 'shrimp squat', 'hip thrust',
  'glute', 'leg raise', 'sissy squat', 'cossack', 'split squat',
  'plank', 'crunch', 'sit up', 'hollow body', 'dead bug', 'v up',
  'dragon flag', 'ab wheel', 'windshield wiper', 'mountain climber',
  'flutter kick', 'bicycle crunch', 'russian twist', 'toe touch',
  'leg raise hang', 'knee raise', 'side plank',
  'handstand', 'l-sit', 'l sit', 'front lever', 'back lever', 'planche',
  'human flag', 'muscle-up', 'frog stand', 'crow pose', 'elbow lever',
  'skin the cat', 'ring', 'tuck planche', 'iron cross',
  'stretch', 'yoga', 'mobility', 'hip flexor', 'pigeon pose',
  'thoracic', 'foam roll', 'shoulder dislocate', 'pancake',
  'hamstring stretch', 'quad stretch', 'calf stretch',
  'burpee', 'jumping jack', 'bear crawl', 'high knee', 'skater',
  'jump rope', 'star jump', 'inchworm', 'turkish get up',
  'bridge', 'superman', 'bird dog', 'good morning', 'back extension',
  'hip hinge', 'reverse hyper',
]

const MACHINE_KEYWORDS = [
  'machine', 'barbell', 'dumbbell', 'cable', 'smith', 'ez bar', 'ez-bar',
  'kettlebell', 'trap bar', 'plate pinch', 'rope pull', 'bench press',
  'lat pull down', 'lat pulldown', 'pulldown', 'pullover machine',
  'pulley', 'leg press', 'leg curl machine', 'leg extension',
  'incline bench', 'decline bench', 'power clean', 'deadlift', 'snatch',
  'landmine', 'sled', 'hack squat machine', 'pec deck', 'fly machine',
  'cable fly', 'cable cross', 'seated row machine', 'chest press machine',
  'shoulder press machine', 'ab machine', 'hip abduct', 'hip adduct',
  'treadmill', 'elliptical', 'rowing machine', 'stairmaster',
]

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function slugify(name) {
  return name.toLowerCase()
    .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o').replace(/[úù]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function inferCategory(name, muscles, note = '') {
  const n = name.toLowerCase()
  const m = muscles.toLowerCase()
  const nt = note.toLowerCase()

  if (n.includes('handstand') || n.includes('l-sit') || n.includes('l sit') ||
      n.includes('muscle-up') || n.includes('muscle up') ||
      n.includes('front lever') || n.includes('back lever') || n.includes('planche') ||
      n.includes('human flag') || n.includes('skill') || n.includes('test de fuerza') ||
      n.includes('iron cross') || n.includes('maltese') || n.includes('frog stand') ||
      n.includes('crow pose') || n.includes('elbow lever') || n.includes('ring support')) return 'skill'
  if (n.includes('stretch') || n.includes('yoga') || n.includes('mobility') || n.includes('movilidad') ||
      n.includes('cat-cow') || n.includes('cat cow') || n.includes('pigeon') || n.includes('child') ||
      n.includes('forward fold') || n.includes('hip flexor') || n.includes('hip mobility') ||
      n.includes('thoracic') || n.includes('cossack') || n.includes('jefferson') ||
      n.includes('world') || n.includes('90/90') || n.includes('psoas') ||
      n.includes('ankle mobil') || n.includes('wrist mobil') || n.includes('arm circle') ||
      n.includes('leg swing') || n.includes('inchworm') || n.includes('shoulder dislocate') ||
      n.includes('pancake') || n.includes('pike stretch') || n.includes('foam roll') ||
      n.includes('quad stretch') || n.includes('calf stretch') || n.includes('hamstring stretch') ||
      n.includes('3d lunge warmup')) return 'movilidad'
  if (n.includes('bird-dog') || n.includes('bird dog') || n.includes('superman') ||
      n.includes('glute bridge') || n.includes('hip bridge') ||
      n.includes('glute activation') || n.includes('back extension') ||
      n.includes('reverse hyper') || n.includes('hip hinge') ||
      nt.includes('lumbar')) return 'lumbar'
  if (n.includes('push-up') || n.includes('push up') || n.includes('pushup') ||
      n.includes('dip') || n.includes('pike push') || n.includes('pike hspu') ||
      n.includes('hspu') || n.includes('diamond') || n.includes('wide push') ||
      n.includes('archer push') || n.includes('sphinx') || n.includes('tiger bend') ||
      n.includes('hindu push') || n.includes('decline push') || n.includes('clapping push') ||
      n.includes('clap push') || n.includes('ring dip') || n.includes('wall push') ||
      n.includes('floor dip') || n.includes('bench dip') || n.includes('chair dip') ||
      n.includes('deficit push') || n.includes('weighted push') ||
      n.includes('finger push') || n.includes('side to side push') ||
      n.includes('parallettes push') || n.includes('incline push')) return 'push'
  if (n.includes('pull-up') || n.includes('pull up') || n.includes('pullup') ||
      n.includes('chin-up') || n.includes('chin up') || n.includes('chinup') ||
      n.includes('row') || n.includes('face pull') || n.includes('facepull') ||
      n.includes('retraccion') || n.includes('retracción') ||
      n.includes('australian') || n.includes('renegade') || n.includes('inverted row') ||
      n.includes('towel pull') || n.includes('dominada') || n.includes('typewriter') ||
      n.includes('commando') || n.includes('l-sit pull') || n.includes('skin the cat') ||
      n.includes('wide grip pull') || n.includes('close grip pull') ||
      n.includes('escapular') || n.includes('scap pull') || n.includes('scapula') ||
      n.includes('bent high pull') || n.includes('band pull') ||
      n.includes('neutral grip pull') || n.includes('archer pull') ||
      n.includes('isometric hold') || n.includes('dead hang') ||
      n.includes('recruitment pull')) return 'pull'
  if (n.includes('squat') || n.includes('sentadilla') || n.includes('lunge') ||
      n.includes('bulgarian') || n.includes('pistol') || n.includes('nordic') ||
      n.includes('step-up') || n.includes('step up') || n.includes('calf raise') ||
      n.includes('wall sit') || n.includes('box jump') || n.includes('shrimp') ||
      n.includes('good morning') || n.includes('rdl') || n.includes('skater') ||
      n.includes('tuck jump') || n.includes('high knee') || n.includes('goblet') ||
      n.includes('hindu squat') || n.includes('sissy') || n.includes('split squat') ||
      n.includes('hip thrust') || n.includes('hamstring kick') ||
      n.includes('hamstring choke') || n.includes('star jump') ||
      n.includes('squat jump') || n.includes('jump squat')) return 'legs'
  if (n.includes('hollow') || n.includes('plank') || n.includes('dead bug') ||
      n.includes('dragon flag') || n.includes('hanging leg raise') || n.includes('leg raise') ||
      n.includes('hanging knee raise') || n.includes('knee raise') ||
      n.includes('windshield') || n.includes('v-up') || n.includes('v up') ||
      n.includes('ab wheel') || n.includes('mountain climb') || n.includes('crunch') ||
      n.includes('sit up') || n.includes('sit-up') || n.includes('russian twist') ||
      n.includes('flutter kick') || n.includes('bicycle') || n.includes('toe touch') ||
      n.includes('plank jack') || n.includes('plank reach') || n.includes('reverse plank') ||
      n.includes('turkish get') ||
      (m.includes('core') && !m.includes('cuad') && !m.includes('dorsal') && !m.includes('pecho'))) return 'core'
  if (n.includes('burpee') || n.includes('jumping jack') || n.includes('bear crawl') ||
      n.includes('jump rope')) return 'full'
  return 'full'
}

function inferDifficulty(name) {
  const n = name.toLowerCase()
  if (n.includes('beginner') || n.includes('assisted') || n.includes('knee push') ||
      n.includes('wall push') || n.includes('wall sit') || n.includes('bodyweight squat') ||
      n.includes('basic') || n.includes('dead hang') || n.includes('arm circle') ||
      n.includes('inchworm') || n.includes('jumping jack') || n.includes('high knee') ||
      n.includes('mountain climb') || n.includes('crunch') || n.includes('bird dog') ||
      n.includes('glute bridge') && !n.includes('single') && !n.includes('march') ||
      n.includes('cat-cow') || n.includes('cat cow') || n.includes('child') ||
      n.includes('superman') || n.includes('v-up') || n.includes('v up') ||
      n.includes('flutter') || n.includes('leg swing') || n.includes('frog stand') ||
      n.includes('plank') && !n.includes('planche') && !n.includes('dynamic')) return 'beginner'
  if (n.includes('one arm') || n.includes('one-arm') || n.includes('handstand push') ||
      n.includes('muscle up') || n.includes('muscle-up') || n.includes('front lever full') ||
      n.includes('front lever completo') || n.includes('back lever') || n.includes('planche') ||
      n.includes('dragon flag') || n.includes('human flag') || n.includes('iron cross') ||
      n.includes('typewriter') || n.includes('weighted pull') || n.includes('tuck planche') ||
      n.includes('ring dip') || n.includes('windshield') || n.includes('full nordic') ||
      n.includes('pistol squat libre') || n.includes('pistol squat free') ||
      n.includes('shrimp squat completo') || n.includes('360') ||
      n.includes('tiger bend') || n.includes('clapping') || n.includes('clap push')) return 'advanced'
  return 'intermediate'
}

// ── Extract exercises from TS source files ────────────────────────────────────
function extractFromTS(filepath) {
  const content = readFileSync(filepath, 'utf8')
  const exercises = []
  const blocks = content.match(/\{[^{}]*id:\s*"[^"]+",\s*name:\s*"[^"]+"[^{}]*\}/g) || []

  for (const block of blocks) {
    const id = block.match(/id:\s*"([^"]+)"/)?.[1]
    const name = block.match(/name:\s*"([^"]+)"/)?.[1]
    const muscles = block.match(/muscles:\s*"([^"]+)"/)?.[1] || ''
    const sets = block.match(/sets:\s*(\d+)/)?.[1] || '3'
    const reps = block.match(/reps:\s*"([^"]+)"/)?.[1] || '8-12'
    const rest = block.match(/rest:\s*(\d+)/)?.[1] || '60'
    const note = block.match(/note:\s*"([^"]+)"/)?.[1] || ''
    const youtube = block.match(/youtube:\s*"([^"]+)"/)?.[1] || ''
    const priority = block.match(/priority:\s*"([^"]+)"/)?.[1] || 'med'
    const isTimer = block.includes('isTimer: true')
    const timerSeconds = block.match(/timerSeconds:\s*(\d+)/)?.[1]
    const category = block.match(/category:\s*"([^"]+)"/)?.[1]
    const difficulty = block.match(/difficulty:\s*"([^"]+)"/)?.[1]
    const equipmentMatch = block.match(/equipment:\s*\[([^\]]*)\]/)
    const equipment = equipmentMatch
      ? equipmentMatch[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || ['ninguno']
      : ['ninguno']

    if (!id || !name) continue
    if (['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'].includes(id)) continue

    exercises.push({
      id,
      name: { es: name },
      muscles: { es: muscles },
      sets: parseInt(sets) || 3, reps, rest: parseInt(rest) || 60,
      note: { es: note },
      priority, isTimer,
      timerSeconds: timerSeconds ? parseInt(timerSeconds) : undefined,
      category, difficulty,
      equipment, source: 'local',
      youtube_search: youtubeUrl(name),
      youtube_query: youtube || `${name} exercise tutorial`,
      images: [],
    })
  }
  return exercises
}

// ── Fetch from wger API ───────────────────────────────────────────────────────
async function fetchWgerExercises() {
  const seenIds = new Set()
  const searchResults = []

  for (const term of SEARCH_TERMS) {
    process.stdout.write(`  wger: "${term}"...`)
    const data = await fetchJSON(`${WGER_BASE}/exercise/search/?term=${encodeURIComponent(term)}&language=en&format=json`)
    if (!data?.suggestions) { console.log(' (no results)'); await sleep(200); continue }

    let added = 0
    for (const s of data.suggestions) {
      const wgerId = s.data?.id
      if (!wgerId || seenIds.has(wgerId)) continue
      seenIds.add(wgerId)
      searchResults.push({
        wger_id: wgerId,
        name: s.data.name,
        category_name: s.data.category?.name || s.data.category || '',
      })
      added++
    }
    console.log(` +${added}`)
    await sleep(150)
  }

  console.log(`  Total unique from search: ${searchResults.length}`)

  const bodyweight = searchResults.filter(r => {
    const nl = r.name.toLowerCase()
    return !MACHINE_KEYWORDS.some(kw => nl.includes(kw))
  })
  console.log(`  After filtering machines: ${bodyweight.length}`)

  console.log(`  Fetching exercise details (${bodyweight.length} exercises)...`)
  const detailed = []
  let i = 0

  for (const ex of bodyweight) {
    i++
    if (i % 20 === 0) process.stdout.write(`  ${i}/${bodyweight.length}...\r`)

    const info = await fetchJSON(`${WGER_BASE}/exerciseinfo/${ex.wger_id}/?format=json`, 10000)
    if (!info) { await sleep(200); continue }

    const equipIds = (info.equipment || []).map(e => e.id)
    const heavyGymEquip = [1, 2, 3, 10]
    if (equipIds.some(id => heavyGymEquip.includes(id)) && !equipIds.includes(7) && !equipIds.includes(6)) {
      await sleep(100)
      continue
    }

    const muscles = [...new Set([
      ...(info.muscles || []).map(m => WGER_MUSCLE_MAP[m.id] || m.name_en || m.name),
      ...(info.muscles_secondary || []).map(m => WGER_MUSCLE_MAP[m.id] || m.name_en || m.name),
    ])].filter(Boolean).join(', ')

    const equipment = [...new Set(
      (info.equipment || []).map(e => WGER_EQUIP_MAP[e.id] || 'ninguno')
    )]
    if (equipment.length === 0) equipment.push('ninguno')

    const enTrans = info.translations?.find(t => t.language === 2)
    const esTrans = info.translations?.find(t => t.language === 4)

    const enDesc = (enTrans?.description || info.description || '').replace(/<[^>]+>/g, '').trim()
    const esDesc = (esTrans?.description || '').replace(/<[^>]+>/g, '').trim()
    const description = { es: esDesc || enDesc, ...(enDesc ? { en: enDesc } : {}) }

    const esName = esTrans?.name
    const enName = enTrans?.name || ex.name
    const displayNameEs = (esName && normalize(esName).includes(normalize(enName).slice(0, 4)))
      ? esName : enName
    const nameField = { es: displayNameEs || enName, ...(enName ? { en: enName } : {}) }

    const category = inferCategory(ex.name, muscles, str(description))
    const difficulty = inferDifficulty(ex.name)

    const images = (info.images || [])
      .sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0))
      .slice(0, 3)
      .map(img => img.image.startsWith('http') ? img.image : `https://wger.de${img.image}`)

    const videos = (info.videos || [])
      .slice(0, 1)
      .map(v => v.video?.startsWith('http') ? v.video : `https://wger.de${v.video}`)

    const musclesField = { es: muscles || 'General', ...(muscles ? { en: muscles } : { en: 'General' }) }
    const noteEs = typeof description === 'object' ? (description.es || '') : description
    const noteEn = typeof description === 'object' ? (description.en || '') : description
    const noteField = { es: noteEs.slice(0, 300), ...(noteEn ? { en: noteEn.slice(0, 300) } : {}) }

    detailed.push({
      id: slugify(ex.name),
      name: nameField,
      muscles: musclesField,
      sets: 3, reps: '8-12', rest: 60,
      note: noteField,
      description,
      priority: 'med',
      isTimer: false,
      category, difficulty, equipment,
      source: 'wger',
      wger_id: ex.wger_id,
      youtube_search: youtubeUrl(ex.name),
      youtube_query: `${ex.name} exercise tutorial`,
      images,
      videos,
    })

    await sleep(150)
  }
  console.log(`  Detailed exercises fetched: ${detailed.length}         `)

  return detailed
}

async function buildBaseListFromWger() {
  console.log('1. Extracting local exercises...')
  const workoutExercises = extractFromTS('packages/core/data/workouts.ts')
  console.log(`   workouts.ts: ${workoutExercises.length} exercises`)
  const suppExercises = extractFromTS('packages/core/data/supplementary-exercises.ts')
  console.log(`   supplementary-exercises.ts: ${suppExercises.length} exercises`)

  console.log('\n2. Fetching wger exercises...')
  const wgerExercises = await fetchWgerExercises()

  console.log('\n3. Merging and deduplicating...')
  const catalog = new Map()
  const normalizedNames = new Map()

  for (const ex of [...workoutExercises, ...suppExercises]) {
    if (catalog.has(ex.id)) continue
    if (!ex.category) ex.category = inferCategory(str(ex.name), str(ex.muscles), str(ex.note))
    if (!ex.difficulty) ex.difficulty = inferDifficulty(str(ex.name))
    catalog.set(ex.id, ex)
    normalizedNames.set(normalize(str(ex.name)), ex.id)
  }

  let wgerAdded = 0, wgerSkipped = 0
  for (const ex of wgerExercises) {
    const normName = normalize(str(ex.name))
    const normEn = ex.name?.en ? normalize(ex.name.en) : normName

    if (normalizedNames.has(normName) || normalizedNames.has(normEn)) { wgerSkipped++; continue }

    let isDupe = false
    for (const existingNorm of normalizedNames.keys()) {
      if ((normName.length > 8 && existingNorm === normName) ||
          (normEn.length > 8 && existingNorm === normEn)) {
        isDupe = true; break
      }
    }
    if (isDupe) { wgerSkipped++; continue }

    if (catalog.has(ex.id)) ex.id = `wger_${ex.wger_id}`
    catalog.set(ex.id, ex)
    normalizedNames.set(normName, ex.id)
    if (normEn !== normName) normalizedNames.set(normEn, ex.id)
    wgerAdded++
  }
  console.log(`   wger added: ${wgerAdded}, skipped: ${wgerSkipped}`)

  const BLACKLIST_NAMES = [
    'reverse bar curl', 'preacher curls', 'lateral raises', 'rear delt raises',
    'standing rope forearm', 'front plate raise', 'butterfly reverse',
    'suspended crossess', 'bus drivers', 'axe hold', 'jogging',
    'kneeling kickbacks', 'body-ups', 'backward shoulder rotation',
    'chin tuck', 't-bar row', 'leg curls', 'medicine ball',
    'curl de bíceps', 'cruce de poleas', 'curl con mancuernas',
    'elevación de pantorrillas en hack', 'front raise (cable)',
    'press diagonal', 'sentadilla con disco', 'squats on multipress',
    'extensión de tríceps', 'remo con polea', 'low-cable cross',
    'standing calf stretch', 'bicep curl', 'full sit outs',
    'blaze', 'pallof press', 'scorpion kick', 'schwimmen',
    'shoulder shrug', 'side lateral raise', 'lat pull down',
    'l hold', 'levantamiento de piernas', 'back lever',
    'hip raise, lying', 'banded shoulder', 'band pull-apart',
    'leg wheel', 'shinbox', 'foam roller',
  ]

  for (const [id, ex] of catalog) {
    if (ex.source !== 'wger') continue
    const nl = str(ex.name, 'en').toLowerCase() || str(ex.name).toLowerCase()
    if (BLACKLIST_NAMES.some(b => nl.includes(b))) { catalog.delete(id); continue }
  }

  return Array.from(catalog.values())
}

// ── Load seeds and id map ─────────────────────────────────────────────────────
function loadSeeds() {
  const idMap = JSON.parse(readFileSync(ID_MAP_PATH, 'utf8'))
  const allSeeds = [] // { slug, entry, category, file }

  for (const seedFile of SEED_FILES) {
    const seedPath = join(SEEDS_DIR, `${seedFile}.json`)
    const seedData = JSON.parse(readFileSync(seedPath, 'utf8'))
    const category = SEED_CAT_MAP[seedFile]

    for (const sub of seedData.subcategories ?? []) {
      for (const ex of sub.exercises ?? []) {
        allSeeds.push({ slug: ex.slug, entry: ex, category, file: seedFile })
      }
    }
  }

  return { idMap, allSeeds }
}

// ── OFFLINE MERGE: read the FROZEN base snapshot (not the merged output) ──────
function loadBaseListFromCatalog() {
  const catalogRaw = JSON.parse(readFileSync(BASE_PATH, 'utf8'))
  const baseList = []
  for (const [, catVal] of Object.entries(catalogRaw.categories ?? {})) {
    for (const ex of catVal.exercises ?? []) {
      baseList.push({ ...ex })
    }
  }
  return baseList
}

// ── Merge seeds into baseList ─────────────────────────────────────────────────
function mergeSeeds(baseList, idMap, allSeeds) {
  // Build lookup: id -> baseList entry (for enrichment)
  const byId = new Map()
  for (const ex of baseList) byId.set(ex.id, ex)

  // Invert map: canonicalId -> first slug (first claim wins)
  const enrichTargets = new Map() // canonicalId -> seed entry
  const newEntries = [] // seeds that need new entries

  // Track which existing ids are targeted
  const existingIds = new Set(baseList.map(e => e.id))

  for (const { slug, entry, category } of allSeeds) {
    const canonicalId = idMap[slug]
    if (!canonicalId) {
      console.warn(`  WARN: slug "${slug}" not found in id map — skipping`)
      continue
    }

    if (existingIds.has(canonicalId)) {
      // Enrichment target — first slug wins
      if (!enrichTargets.has(canonicalId)) {
        enrichTargets.set(canonicalId, { slug, entry, category })
      }
      // else: multi-claim, later slug treated as new
      // But wait — if later slug has a NEW id (from idMap), it would be different
      // So we don't need extra handling here — the slug->id mapping already
      // assigned a different id for multi-claim extras
    } else {
      // New entry
      if (!enrichTargets.has(canonicalId)) {
        newEntries.push({ canonicalId, slug, entry, category })
        enrichTargets.set(canonicalId, { slug, entry, category, isNew: true })
      }
    }
  }

  // ENRICH pass
  let enrichedCount = 0
  for (const ex of baseList) {
    const target = enrichTargets.get(ex.id)
    if (!target || target.isNew) continue

    const { entry } = target
    // Overlay: seed wins for description, difficulty, equipment, muscles
    // KEEP: id, category, sets, reps, rest, note, priority, isTimer, timerSeconds,
    //       source, images, videos, youtube_search, youtube_query
    if (entry.description) {
      ex.description = entry.description
    }
    if (entry.difficulty_level) {
      ex.difficulty = mapDifficulty(entry.difficulty_level)
    }
    if (entry.equipment !== undefined) {
      ex.equipment = mapEquipment(entry.equipment)
    }
    if (entry.muscles) {
      ex.muscles = entry.muscles
    }
    // [015] Carry structured media into the bundled catalog as origin-relative paths
    if (entry.media && typeof entry.media === 'object') {
      const m = entry.media
      const built = {}
      if (m.sequence) built.sequence = `/exercise-media/${target.slug}/${m.sequence}`
      if (m.muscles)  built.muscles  = `/exercise-media/${target.slug}/${m.muscles}`
      if (m.thumbnail) built.thumbnail = `/exercise-media/${target.slug}/${m.thumbnail}`
      if (m.video)    built.video    = `/exercise-media/${target.slug}/${m.video}`
      if (Object.keys(built).length > 0) ex.media = built
    }
    // Add provenance
    ex.seed_slug = target.slug

    // Overlay tempo if seed provides it (plan-013: structured tempo plumbing)
    if (entry.tempo) ex.tempo = entry.tempo

    // Ensure name.en is populated (may be missing on old entries)
    if (!ex.name.en && ex.name.es) {
      ex.name = { es: ex.name.es, en: entry.name?.en || ex.name.es }
    }
    if (!ex.name.es && ex.name.en) {
      ex.name = { es: entry.name?.es || ex.name.en, en: ex.name.en }
    }

    enrichedCount++
  }

  // NEW ENTRY pass
  let newCount = 0
  for (const { canonicalId, slug, entry, category } of newEntries) {
    const nameEs = entry.name?.es || entry.name?.en || slug
    const nameEn = entry.name?.en || entry.name?.es || slug

    const newEx = {
      id: canonicalId,
      name: { es: nameEs || nameEn, en: nameEn || nameEs },
      muscles: entry.muscles || { es: 'General', en: 'General' },
      sets: entry.default_sets ?? 3,
      reps: entry.default_reps ?? '8-12',
      rest: entry.default_rest_seconds ?? 60,
      note: { es: '', en: '' },
      description: entry.description || { es: '', en: '' },
      priority: 'med',
      isTimer: false,
      category,
      difficulty: mapDifficulty(entry.difficulty_level),
      equipment: mapEquipment(entry.equipment),
      source: 'seed',
      youtube_search: youtubeUrl(nameEn || nameEs),
      youtube_query: `${nameEn || nameEs} exercise tutorial`,
      images: [],
      seed_slug: slug,
      // plan-013: structured tempo plumbing — included when seed provides it
      ...(entry.tempo ? { tempo: entry.tempo } : {}),
      // [015] Carry structured media into the bundled catalog as origin-relative paths
      ...((() => {
        if (!entry.media || typeof entry.media !== 'object') return {}
        const m = entry.media
        const built = {}
        if (m.sequence)  built.sequence  = `/exercise-media/${slug}/${m.sequence}`
        if (m.muscles)   built.muscles   = `/exercise-media/${slug}/${m.muscles}`
        if (m.thumbnail) built.thumbnail = `/exercise-media/${slug}/${m.thumbnail}`
        if (m.video)     built.video     = `/exercise-media/${slug}/${m.video}`
        return Object.keys(built).length > 0 ? { media: built } : {}
      })()),
    }

    // Ensure both name fields are non-empty
    if (!newEx.name.es) newEx.name.es = newEx.name.en
    if (!newEx.name.en) newEx.name.en = newEx.name.es

    baseList.push(newEx)
    newCount++
  }

  // variant_of pass: stamp _N collision pairs conservatively.
  // Only links x_2 → x when x also exists in the final list.
  // No guessing for anything else.
  const finalIdSet = new Set(baseList.map(e => e.id))
  for (const ex of baseList) {
    const m = ex.id.match(/^(.+)_(\d+)$/)
    if (m && finalIdSet.has(m[1])) {
      ex.variant_of = m[1]
    }
  }

  return { enrichedCount, newCount }
}

// ── HARD INVARIANT check ──────────────────────────────────────────────────────
function assertInvariant(originalIds, finalList) {
  const finalIds = new Set(finalList.map(e => e.id))

  // Check for duplicates
  const seen = new Map()
  for (const ex of finalList) {
    if (seen.has(ex.id)) {
      throw new Error(`INVARIANT VIOLATED: Duplicate id "${ex.id}" in final catalog!`)
    }
    seen.set(ex.id, true)
  }

  // Check old ⊆ new
  const missing = []
  for (const id of originalIds) {
    if (!finalIds.has(id)) missing.push(id)
  }
  if (missing.length > 0) {
    throw new Error(
      `INVARIANT VIOLATED: These original ids are MISSING from final catalog:\n  ${missing.join('\n  ')}\n` +
      'DO NOT WRITE — fix the merge logic.'
    )
  }
}

// ── Rebuild catalog structure ─────────────────────────────────────────────────
function rebuildCatalog(finalList) {
  const byCategory = {}
  for (const ex of finalList) {
    const cat = ex.category || 'full'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(ex)
  }

  // Sort each category by name.es
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => {
      const aName = a.name?.es || ''
      const bName = b.name?.es || ''
      return aName.localeCompare(bName, 'es')
    })
  }

  const totalCount = finalList.length
  const withImages = finalList.filter(e => e.images?.length > 0).length
  // [014] Split video stat: curated = real hosted files; youtube_query = search fallback only
  const withCuratedVideo = finalList.filter(e => e.videos?.length > 0 || e.media?.video).length
  const withYoutubeQuery = finalList.filter(e => !!(e.youtube_query || e.youtube_search)).length
  // [015] Structured media counters
  const withSequence = finalList.filter(e => !!e.media?.sequence).length
  const withMuscleMap = finalList.filter(e => !!e.media?.muscles).length

  return {
    generated_at: new Date().toISOString(),
    total_count: totalCount,
    local_count: finalList.filter(e => e.source === 'local').length,
    wger_count: finalList.filter(e => e.source === 'wger').length,
    with_images: withImages,
    with_curated_video: withCuratedVideo,
    with_youtube_query: withYoutubeQuery,
    with_sequence: withSequence,
    with_muscle_map: withMuscleMap,
    categories: Object.keys(byCategory).sort().reduce((obj, key) => {
      obj[key] = { count: byCategory[key].length, exercises: byCategory[key] }
      return obj
    }, {}),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const refreshWger = args.includes('--refresh-wger')

  console.log(`Building exercise catalog... [mode: ${refreshWger ? 'ONLINE (wger)' : 'OFFLINE (merge seeds)'}]\n`)

  let baseList

  if (refreshWger) {
    console.log('=== ONLINE MODE: fetching from wger ===\n')
    baseList = await buildBaseListFromWger()
    // Freeze the refreshed base so future OFFLINE runs are reproducible.
    const baseSnapshot = rebuildCatalog(baseList)
    writeFileSync(BASE_PATH, JSON.stringify(baseSnapshot, null, 2))
    console.log(`Refreshed frozen base snapshot: ${BASE_PATH} (${baseList.length} exercises)\n`)
  } else {
    console.log('=== OFFLINE MODE: reading frozen base snapshot ===\n')
    baseList = loadBaseListFromCatalog()
    console.log(`Base list loaded: ${baseList.length} exercises from frozen base\n`)
  }

  // Capture original id set for invariant check
  const originalIds = new Set(baseList.map(e => e.id))
  console.log(`Original id set: ${originalIds.size} exercises`)

  // Load seeds and id map
  console.log('Loading seeds and id map...')
  const { idMap, allSeeds } = loadSeeds()
  console.log(`Seeds loaded: ${allSeeds.length} exercises`)
  console.log(`ID map: ${Object.keys(idMap).length} entries\n`)

  // Merge
  console.log('Merging seeds into catalog...')
  const { enrichedCount, newCount } = mergeSeeds(baseList, idMap, allSeeds)
  console.log(`  Enriched: ${enrichedCount} existing entries`)
  console.log(`  New entries added: ${newCount}`)

  // Log lossy equipment mappings
  if (LOSSY_MAP_LOG.length > 0) {
    console.log('\nLossy equipment mappings:')
    for (const msg of LOSSY_MAP_LOG) console.log(`  WARN: ${msg}`)
  }

  // HARD INVARIANT check (throws on violation — do NOT write)
  console.log('\nChecking invariants...')
  assertInvariant(originalIds, baseList)
  console.log('  Invariant OK: all original ids present, no duplicates')

  // Rebuild catalog structure
  const output = rebuildCatalog(baseList)
  const jsonStr = JSON.stringify(output, null, 2)

  // Write all 3 copies
  console.log('\nWriting catalog copies...')
  for (const outPath of OUTPUT_PATHS) {
    writeFileSync(outPath, jsonStr)
    console.log(`  Written: ${outPath}`)
  }

  // Summary
  const missingDesc = baseList.filter(e => !e.description?.es && !e.description?.en).length
  console.log('\n=== Summary ===')
  console.log(`  Total exercises: ${output.total_count}`)
  console.log(`  Enriched: ${enrichedCount}`)
  console.log(`  New entries: ${newCount}`)
  console.log(`  Missing description: ${missingDesc}/${output.total_count} (${Math.round((output.total_count - missingDesc) / output.total_count * 100)}% covered)`)
  console.log(`  with_sequence: ${output.with_sequence}`)
  console.log(`  with_muscle_map: ${output.with_muscle_map}`)
  console.log('\nCategory breakdown:')
  for (const [cat, data] of Object.entries(output.categories)) {
    console.log(`  ${cat}: ${data.count}`)
  }
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message)
  process.exit(1)
})
