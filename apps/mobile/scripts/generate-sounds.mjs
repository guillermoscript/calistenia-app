#!/usr/bin/env node
/**
 * Genera los WAV de assets/sounds/ replicando los osciladores Web Audio de
 * apps/web/src/lib/sounds.ts (RN no tiene Web Audio API; expo-audio reproduce
 * archivos). Re-ejecutar solo si cambian los tonos de la web:
 *
 *   node scripts/generate-sounds.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 22050
const MASTER_GAIN = 0.6 // los tonos solapados suman >1.0 — bajar para no clipear
const TAIL_S = 0.05

// Mismas secuencias [freq, startAt, duration, gain, type] que la web.
const SOUNDS = {
  'rest-start': [
    [660, 0, 0.3, 0.8, 'triangle'],
    [520, 0.15, 0.35, 0.7, 'triangle'],
  ],
  'get-ready': [
    [440, 0, 0.18, 0.9, 'square'],
    [660, 0.12, 0.18, 0.95, 'square'],
    [880, 0.24, 0.3, 1.0, 'square'],
  ],
  'countdown-tick': [[1000, 0, 0.1, 0.8, 'square']],
  'warning': [
    [600, 0, 0.15, 0.75, 'triangle'],
    [600, 0.18, 0.15, 0.75, 'triangle'],
  ],
  'set-complete': [
    [880, 0, 0.15, 1.0, 'square'],
    [1100, 0.1, 0.2, 0.9, 'square'],
  ],
  'session-complete': [
    [523, 0, 0.25, 0.9, 'square'],
    [659, 0.15, 0.25, 0.9, 'square'],
    [784, 0.3, 0.25, 0.95, 'square'],
    [1047, 0.45, 0.45, 1.0, 'square'],
  ],
  'timer-complete': [
    [880, 0, 0.18, 0.9, 'square'],
    [880, 0.2, 0.18, 0.9, 'square'],
    [1100, 0.4, 0.3, 0.95, 'square'],
  ],
}

function wave(type, phase) {
  const p = phase % 1
  switch (type) {
    case 'square': return p < 0.5 ? 1 : -1
    case 'triangle': return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4
    default: return Math.sin(2 * Math.PI * p)
  }
}

function render(tones) {
  const total = Math.max(...tones.map(([, start, dur]) => start + dur)) + TAIL_S
  const samples = new Float64Array(Math.ceil(total * SAMPLE_RATE))
  for (const [freq, startAt, duration, gain, type] of tones) {
    const from = Math.floor(startAt * SAMPLE_RATE)
    const count = Math.floor(duration * SAMPLE_RATE)
    for (let i = 0; i < count; i++) {
      const t = i / SAMPLE_RATE
      // exponentialRampToValueAtTime(0.001) de Web Audio
      const env = gain * Math.pow(0.001 / gain, t / duration)
      samples[from + i] += env * wave(type, freq * t)
    }
  }
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] * MASTER_GAIN))
    pcm[i] = Math.round(v * 32767)
  }
  return pcm
}

function toWav(pcm) {
  const dataSize = pcm.length * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16) // tamaño del chunk fmt
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits/sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  Buffer.from(pcm.buffer).copy(buf, 44)
  return buf
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds')
mkdirSync(outDir, { recursive: true })
for (const [name, tones] of Object.entries(SOUNDS)) {
  const file = join(outDir, `${name}.wav`)
  writeFileSync(file, toWav(render(tones)))
  console.log(`✓ ${name}.wav`)
}
