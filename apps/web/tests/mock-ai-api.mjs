#!/usr/bin/env node
/**
 * Mock del AI API (:3001) para correr la suite E2E sin gastar créditos de IA.
 *
 * Implementa los endpoints que el front consume vía el proxy de Vite
 * (/api/analyze-meal, /api/score-meal-quality, /api/jobs/*, /api/health) con
 * respuestas canned que respetan los contratos de packages/core
 * (useNutrition.analyzeMeal y lib/ai-jobs-api.ts).
 *
 * Uso:  node apps/web/tests/mock-ai-api.mjs [puerto]   (default 3001)
 */
import http from 'node:http'

const PORT = Number(process.argv[2] || process.env.MOCK_AI_PORT || 3001)

const MOCK_FOOD = {
  name: 'Sandwich de huevo con queso y jamón',
  portionAmount: 1,
  portionUnit: 'unidad',
  unitWeightInGrams: 180,
  calories: 420,
  protein: 24,
  carbs: 32,
  fat: 21,
  baseCal100: 233,
  baseProt100: 13.3,
  baseCarbs100: 17.8,
  baseFat100: 11.7,
  category: 'protein',
  tags: ['mock'],
  portionNote: '1 sandwich',
}

const MOCK_QUALITY = {
  score: 'B',
  breakdown: {
    positives: ['Buena fuente de proteína', 'Porción razonable'],
    negatives: ['Algo alto en grasa saturada'],
    summary: 'Comida equilibrada con buen aporte proteico (respuesta mock de E2E).',
  },
  message: 'Buen aporte de proteína para tu objetivo.',
  suggestion: null,
}

const MOCK_ANALYSIS = {
  foods: [MOCK_FOOD],
  totals: { calories: 420, protein: 24, carbs: 32, fat: 21 },
  meal_description: 'Sandwich de huevo con queso y jamón (mock)',
  quality: MOCK_QUALITY,
}

let jobCounter = 0
const jobs = new Map()

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** Consume el body sin parsearlo (multipart/JSON dan igual: la respuesta es canned). */
function drain(req) {
  return new Promise((resolve) => {
    req.on('data', () => {})
    req.on('end', resolve)
    req.on('error', resolve)
  })
}

function completedJob(id, type, result) {
  const now = new Date().toISOString()
  return { id, type, status: 'completed', result, error: null, created: now, updated: now }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  console.log(`[mock-ai-api] ${req.method} ${path}`)
  await drain(req)

  if (path === '/api/health') return json(res, 200, { status: 'ok', mock: true })

  if (path === '/api/analyze-meal' && req.method === 'POST') {
    return json(res, 200, { analysis: MOCK_ANALYSIS, model_used: 'mock-e2e' })
  }

  if (path === '/api/score-meal-quality' && req.method === 'POST') {
    return json(res, 200, { quality: MOCK_QUALITY })
  }

  // Jobs asíncronos: POST /api/jobs/<type> → job_id; GET /api/jobs/<id> → completed.
  const submitMatch = path.match(/^\/api\/jobs\/([a-z-]+)$/)
  if (submitMatch && req.method === 'POST') {
    const type = submitMatch[1]
    const id = `mockjob_${++jobCounter}`
    const result = type === 'analyze-meal' ? { analysis: MOCK_ANALYSIS } : { mock: true }
    jobs.set(id, completedJob(id, type, result))
    return json(res, 200, { job_id: id })
  }
  const statusMatch = path.match(/^\/api\/jobs\/(mockjob_\d+)$/)
  if (statusMatch && req.method === 'GET') {
    const job = jobs.get(statusMatch[1])
    if (job) return json(res, 200, job)
    return json(res, 404, { error: 'job not found' })
  }

  // Resto de endpoints de IA (weekly-plan, insights, free-session…): no
  // implementados a propósito — si un test los necesita, que falle visible.
  json(res, 501, { error: `mock-ai-api: endpoint no implementado: ${req.method} ${path}` })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-ai-api] escuchando en http://127.0.0.1:${PORT}`)
})
