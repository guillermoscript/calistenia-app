#!/usr/bin/env node
/**
 * Build a comprehensive, deduplicated exercise catalog.
 *
 * 1. Collects all exercises from workouts.ts + supplementary-exercises.ts
 * 2. Fetches bodyweight/calisthenics exercises from wger API
 * 3. Deduplicates by normalized name (exact match only)
 * 4. Stores image URLs and YouTube tutorial links
 * 5. Outputs a clean master JSON organized by category
 *
 * Translatable fields (name, muscles, note, description) are stored as
 * i18n JSON objects: { es: "...", en: "..." }.
 *
 * Usage: node scripts/build-exercise-catalog.mjs
 * NOTE: After modifying this script, regenerate the catalog by running it.
 */

import { readFileSync, writeFileSync } from 'fs'

const WGER_BASE = 'https://wger.de/api/v2'

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

// ── Comprehensive search terms ────────────────────────────────────────────────
const SEARCH_TERMS = [
  // Upper push
  'push up', 'push-up', 'dip', 'handstand push', 'pike push', 'diamond push',
  'archer push', 'decline push', 'incline push', 'clap push', 'wide push',
  'hindu push', 'one arm push', 'pseudo planche', 'sphinx',
  // Upper pull
  'pull up', 'pull-up', 'chin up', 'row', 'inverted row', 'australian',
  'muscle up', 'face pull', 'typewriter', 'commando', 'towel pull',
  // Legs
  'squat', 'lunge', 'pistol', 'bulgarian', 'nordic curl', 'calf raise',
  'step up', 'wall sit', 'box jump', 'shrimp squat', 'hip thrust',
  'glute', 'leg raise', 'sissy squat', 'cossack', 'split squat',
  // Core
  'plank', 'crunch', 'sit up', 'hollow body', 'dead bug', 'v up',
  'dragon flag', 'ab wheel', 'windshield wiper', 'mountain climber',
  'flutter kick', 'bicycle crunch', 'russian twist', 'toe touch',
  'leg raise hang', 'knee raise', 'side plank',
  // Skills
  'handstand', 'l-sit', 'l sit', 'front lever', 'back lever', 'planche',
  'human flag', 'muscle-up', 'frog stand', 'crow pose', 'elbow lever',
  'skin the cat', 'ring', 'tuck planche', 'iron cross',
  // Mobility / Stretch
  'stretch', 'yoga', 'mobility', 'hip flexor', 'pigeon pose',
  'thoracic', 'foam roll', 'shoulder dislocate', 'pancake',
  'hamstring stretch', 'quad stretch', 'calf stretch',
  // Full body / Cardio
  'burpee', 'jumping jack', 'bear crawl', 'high knee', 'skater',
  'jump rope', 'star jump', 'inchworm', 'turkish get up',
  // Lumbar / posterior chain
  'bridge', 'superman', 'bird dog', 'good morning', 'back extension',
  'hip hinge', 'reverse hyper',
]

// ── Machine/barbell keywords to filter out ────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferCategory(name, muscles, note = '') {
  const n = name.toLowerCase()
  const m = muscles.toLowerCase()
  const nt = note.toLowerCase()

  // Skills
  if (n.includes('handstand') || n.includes('l-sit') || n.includes('l sit') ||
      n.includes('muscle-up') || n.includes('muscle up') ||
      n.includes('front lever') || n.includes('back lever') || n.includes('planche') ||
      n.includes('human flag') || n.includes('skill') || n.includes('test de fuerza') ||
      n.includes('iron cross') || n.includes('maltese') || n.includes('frog stand') ||
      n.includes('crow pose') || n.includes('elbow lever') || n.includes('ring support')) return 'skill'
  // Movilidad
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
  // Lumbar
  if (n.includes('bird-dog') || n.includes('bird dog') || n.includes('superman') ||
      n.includes('glute bridge') || n.includes('hip bridge') ||
      n.includes('glute activation') || n.includes('back extension') ||
      n.includes('reverse hyper') || n.includes('hip hinge') ||
      nt.includes('lumbar')) return 'lumbar'
  // Push
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
  // Pull
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
  // Legs
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
  // Core (after push/pull/legs)
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
  // Full
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

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function slugify(name) {
  return name.toLowerCase()
    .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o').replace(/[úù]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
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

  // Filter out machine exercises
  const bodyweight = searchResults.filter(r => {
    const nl = r.name.toLowerCase()
    return !MACHINE_KEYWORDS.some(kw => nl.includes(kw))
  })
  console.log(`  After filtering machines: ${bodyweight.length}`)

  // Fetch detailed info — process ALL bodyweight exercises
  console.log(`  Fetching exercise details (${bodyweight.length} exercises)...`)
  const detailed = []
  let i = 0

  for (const ex of bodyweight) {
    i++
    if (i % 20 === 0) process.stdout.write(`  ${i}/${bodyweight.length}...\r`)

    const info = await fetchJSON(`${WGER_BASE}/exerciseinfo/${ex.wger_id}/?format=json`, 10000)
    if (!info) { await sleep(200); continue }

    // Check equipment — skip if it requires heavy gym equipment
    const equipIds = (info.equipment || []).map(e => e.id)
    // Equipment IDs: 1=Barbell, 2=SZ-Bar, 3=Dumbbell, 5=Swiss Ball, 6=Pull-up bar,
    // 7=none (bodyweight), 8=Bench, 9=Incline bench, 10=Kettlebell
    const heavyGymEquip = [1, 2, 3, 10] // barbell, sz-bar, dumbbell, kettlebell
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

    // Get translations for both ES and EN
    const enTrans = info.translations?.find(t => t.language === 2)
    const esTrans = info.translations?.find(t => t.language === 4)

    const enDesc = (enTrans?.description || info.description || '').replace(/<[^>]+>/g, '').trim()
    const esDesc = (esTrans?.description || '').replace(/<[^>]+>/g, '').trim()
    const description = { es: esDesc || enDesc, ...(enDesc ? { en: enDesc } : {}) }

    const esName = esTrans?.name
    const enName = enTrans?.name || ex.name
    // Use Spanish name only if it seems related to the English name
    const displayNameEs = (esName && normalize(esName).includes(normalize(enName).slice(0, 4)))
      ? esName : enName
    const nameField = { es: displayNameEs || enName, ...(enName ? { en: enName } : {}) }

    // Category
    const category = inferCategory(ex.name, muscles, str(description))
    const difficulty = inferDifficulty(ex.name)

    // Images — store URLs from wger
    const images = (info.images || [])
      .sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0))
      .slice(0, 3)
      .map(img => img.image.startsWith('http') ? img.image : `https://wger.de${img.image}`)

    // Videos
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Building master exercise catalog...\n')

  // 1. Extract from local files
  console.log('1. Extracting local exercises...')
  const workoutExercises = extractFromTS('src/data/workouts.ts')
  console.log(`   workouts.ts: ${workoutExercises.length} exercises`)
  const suppExercises = extractFromTS('src/data/supplementary-exercises.ts')
  console.log(`   supplementary-exercises.ts: ${suppExercises.length} exercises`)

  // 2. Fetch from wger
  console.log('\n2. Fetching wger exercises...')
  const wgerExercises = await fetchWgerExercises()

  // 3. Merge and deduplicate
  console.log('\n3. Merging and deduplicating...')
  const catalog = new Map()
  const normalizedNames = new Map()

  // Local exercises take priority
  for (const ex of [...workoutExercises, ...suppExercises]) {
    if (catalog.has(ex.id)) continue
    if (!ex.category) ex.category = inferCategory(str(ex.name), str(ex.muscles), str(ex.note))
    if (!ex.difficulty) ex.difficulty = inferDifficulty(str(ex.name))
    catalog.set(ex.id, ex)
    normalizedNames.set(normalize(str(ex.name)), ex.id)
  }
  console.log(`   Local exercises: ${catalog.size}`)

  // Add wger exercises — only skip exact normalized name matches
  let wgerAdded = 0, wgerSkipped = 0
  for (const ex of wgerExercises) {
    const norm = normalize(str(ex.name))
    const normEn = ex.name?.en ? normalize(ex.name.en) : norm

    if (normalizedNames.has(norm) || normalizedNames.has(normEn)) {
      wgerSkipped++
      continue
    }

    // Check for very close matches (one is substring of the other AND short)
    let isDupe = false
    for (const existingNorm of normalizedNames.keys()) {
      if ((norm.length > 8 && existingNorm === norm) ||
          (normEn.length > 8 && existingNorm === normEn)) {
        isDupe = true; break
      }
    }
    if (isDupe) { wgerSkipped++; continue }

    if (catalog.has(ex.id)) ex.id = `wger_${ex.wger_id}`
    catalog.set(ex.id, ex)
    normalizedNames.set(norm, ex.id)
    if (normEn !== norm) normalizedNames.set(normEn, ex.id)
    wgerAdded++
  }
  console.log(`   wger added: ${wgerAdded}, skipped: ${wgerSkipped}`)

  // 3b. Post-process: remove non-calisthenics wger exercises and fix bad data
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
    if (BLACKLIST_NAMES.some(b => nl.includes(b))) {
      catalog.delete(id)
      continue
    }
  }
  // Fix bad muscle data from wger based on category
  const MUSCLE_DEFAULTS = {
    push: 'Pecho, Deltoides, Triceps',
    pull: 'Dorsal, Biceps, Trapecio',
    legs: 'Cuadriceps, Gluteos, Isquios',
    core: 'Core, Oblicuos',
    lumbar: 'Lumbar, Gluteos, Isquios',
    skill: 'Hombros, Core, Equilibrio',
    movilidad: 'Movilidad, Flexibilidad',
    full: 'Full body',
  }
  for (const [, ex] of catalog) {
    if (ex.source !== 'wger') continue
    // If muscles are clearly wrong (e.g., "Biceps" for sit-ups), override
    const mStr = str(ex.muscles)
    if (!mStr || mStr === 'General' ||
        (ex.category === 'core' && !mStr.includes('Core')) ||
        (ex.category === 'legs' && !mStr.includes('Cuad') && !mStr.includes('Glut') && !mStr.includes('Isquio')) ||
        (ex.category === 'push' && !mStr.includes('Pecho') && !mStr.includes('Tricep') && !mStr.includes('Deltoid'))) {
      const defaultMuscle = MUSCLE_DEFAULTS[ex.category] || mStr
      ex.muscles = { es: defaultMuscle, en: defaultMuscle }
    }
  }

  console.log(`   After cleanup: ${catalog.size} exercises`)

  // 4. Organize by category
  const allExercises = Array.from(catalog.values())
  const byCategory = {}
  for (const ex of allExercises) {
    const cat = ex.category || 'full'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(ex)
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => str(a.name).localeCompare(str(b.name)))
  }

  // 5. Stats
  const withImages = allExercises.filter(e => e.images?.length > 0).length
  const withVideos = allExercises.filter(e => e.videos?.length > 0 || e.youtube_search).length

  const output = {
    generated_at: new Date().toISOString(),
    total_count: allExercises.length,
    local_count: catalog.size - wgerAdded,
    wger_count: wgerAdded,
    with_images: withImages,
    with_video_links: withVideos,
    categories: Object.keys(byCategory).sort().reduce((obj, key) => {
      obj[key] = { count: byCategory[key].length, exercises: byCategory[key] }
      return obj
    }, {}),
  }

  console.log('\n4. Category breakdown:')
  for (const [cat, data] of Object.entries(output.categories)) {
    console.log(`   ${cat}: ${data.count}`)
  }
  console.log(`\n   TOTAL: ${output.total_count} exercises`)
  console.log(`   With images: ${withImages}`)
  console.log(`   With video links: ${withVideos}`)

  writeFileSync('src/data/exercise-catalog.json', JSON.stringify(output, null, 2))
  console.log('\n   Written to src/data/exercise-catalog.json')
}

main().catch(console.error)
