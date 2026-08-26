/**
 * exerciseMediaDiscovery.test.mjs — el descubrimiento de media en disco (#619).
 *
 * Vive en `packages/core` y no junto al script porque los tests de `scripts/`
 * no los recoge ningún vitest: el include por defecto solo mira dentro de cada
 * paquete, así que un test ahí sería decorativo. Este corre en `pnpm test`.
 *
 * Lo que protege es justo lo que falla en silencio: si el emparejado
 * fichero→hueco o la asignación de carpeta se rompen, no salta ningún error —
 * simplemente la imagen no aparece nunca, que es como se llegó a tener un solo
 * ejercicio con media tras meses de pipeline montado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  derivedMediaSlug,
  buildMediaSlugIndex,
  discoverMediaFiles,
} from '../../../scripts/lib/exercise-media.mjs'

describe('derivedMediaSlug', () => {
  it('cambia guiones bajos por guiones', () => {
    expect(derivedMediaSlug('australian_pullup')).toBe('australian-pullup')
  })

  it('deja intacto un id que ya viene con guiones', () => {
    expect(derivedMediaSlug('strict-pull-up')).toBe('strict-pull-up')
  })
})

describe('buildMediaSlugIndex', () => {
  it('un seed_slug explícito gana al derivado', () => {
    const { slugById } = buildMediaSlugIndex([
      { id: 'pullup_strict', seed_slug: 'strict-pull-up' },
    ])
    expect(slugById.get('pullup_strict')).toBe('strict-pull-up')
  })

  it('un ejercicio sin seed_slug recibe la carpeta derivada de su id', () => {
    const { slugById } = buildMediaSlugIndex([{ id: 'australian_pullup' }])
    expect(slugById.get('australian_pullup')).toBe('australian-pullup')
  })

  it('el derivado que choca con un explícito se descarta y se reporta', () => {
    // El par real del catálogo: `chinup` tiene seed, `chin_up` es su gemelo
    // duplicado. Los dos derivarían a "chin-up"; la carpeta es del que tiene seed.
    const { slugById, conflicts } = buildMediaSlugIndex([
      { id: 'chinup', seed_slug: 'chin-up' },
      { id: 'chin_up' },
    ])
    expect(slugById.get('chinup')).toBe('chin-up')
    expect(slugById.has('chin_up')).toBe(false)
    expect(conflicts).toEqual([
      { slug: 'chin-up', kept: 'chinup', dropped: 'chin_up', kind: 'derived' },
    ])
  })

  it('el orden de la lista no cambia quién se queda la carpeta', () => {
    const reversed = buildMediaSlugIndex([
      { id: 'chin_up' },
      { id: 'chinup', seed_slug: 'chin-up' },
    ])
    expect(reversed.slugById.get('chinup')).toBe('chin-up')
    expect(reversed.slugById.has('chin_up')).toBe(false)
  })
})

describe('discoverMediaFiles', () => {
  let root

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'exercise-media-'))

    mkdirSync(join(root, 'full-house'))
    for (const f of ['sequence.webp', 'muscles.png', 'thumbnail.jpg', 'video.mp4']) {
      writeFileSync(join(root, 'full-house', f), '')
    }

    mkdirSync(join(root, 'con-basura'))
    for (const f of ['sequence.webp', '_sequence.psd', '.DS_Store', 'notas.txt', 'muscles.psd']) {
      writeFileSync(join(root, 'con-basura', f), '')
    }

    mkdirSync(join(root, 'duplicado'))
    for (const f of ['sequence.png', 'sequence.webp']) {
      writeFileSync(join(root, 'duplicado', f), '')
    }
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('encuentra los cuatro huecos por el nombre del fichero', () => {
    expect(discoverMediaFiles('full-house', root)).toEqual({
      sequence: 'sequence.webp',
      muscles: 'muscles.png',
      thumbnail: 'thumbnail.jpg',
      video: 'video.mp4',
    })
  })

  it('ignora borradores, ocultos, nombres no reconocidos y extensiones no válidas', () => {
    // `muscles.psd` lleva el nombre bueno pero una extensión que no se sirve:
    // colarla dejaría un .psd enlazado desde el catálogo.
    expect(discoverMediaFiles('con-basura', root)).toEqual({ sequence: 'sequence.webp' })
  })

  it('con dos candidatos al mismo hueco elige siempre el mismo', () => {
    // El orden que devuelve readdir depende del sistema de ficheros; el build
    // tiene que dar el mismo catálogo en cualquier máquina.
    expect(discoverMediaFiles('duplicado', root)).toEqual({ sequence: 'sequence.png' })
  })

  it('una carpeta que no existe no es un error, es simplemente sin media', () => {
    expect(discoverMediaFiles('no-existe', root)).toEqual({})
  })
})
