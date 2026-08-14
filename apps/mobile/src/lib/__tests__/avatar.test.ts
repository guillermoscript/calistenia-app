import { describe, it, expect } from 'vitest'
import {
  AVATAR_MIME_TYPES,
  MAX_AVATAR_SIZE_BYTES,
  avatarFileName,
  normalizeAvatarMime,
  resolveAvatarMime,
  withCacheToken,
} from '../avatar'

describe('normalizeAvatarMime', () => {
  it('acepta los tres formatos del campo de PocketBase', () => {
    for (const mime of AVATAR_MIME_TYPES) {
      expect(normalizeAvatarMime(mime)).toBe(mime)
    }
  })

  it('tolera mayúsculas, espacios y parámetros', () => {
    expect(normalizeAvatarMime('IMAGE/PNG')).toBe('image/png')
    expect(normalizeAvatarMime(' image/jpeg ; charset=binary')).toBe('image/jpeg')
  })

  it('mapea el image/jpg no estándar de algunos pickers a image/jpeg', () => {
    expect(normalizeAvatarMime('image/jpg')).toBe('image/jpeg')
  })

  it('rechaza lo que PocketBase rechazaría', () => {
    expect(normalizeAvatarMime('image/heic')).toBeNull()
    expect(normalizeAvatarMime('image/gif')).toBeNull()
    expect(normalizeAvatarMime('application/pdf')).toBeNull()
    expect(normalizeAvatarMime('')).toBeNull()
    expect(normalizeAvatarMime(undefined)).toBeNull()
  })
})

describe('resolveAvatarMime', () => {
  it('se queda con el primer candidato válido', () => {
    expect(resolveAvatarMime(['image/png', 'image/jpeg'])).toBe('image/png')
  })

  it('salta los candidatos vacíos', () => {
    expect(resolveAvatarMime([undefined, '', 'image/webp'])).toBe('image/webp')
  })

  it('asume JPEG cuando el picker no reporta nada (Android)', () => {
    expect(resolveAvatarMime([undefined])).toBe('image/jpeg')
    expect(resolveAvatarMime([])).toBe('image/jpeg')
  })

  it('devuelve null si algún candidato dijo un formato no admitido', () => {
    // Ojo: distinto de "no dijo nada". Aquí sí hay que avisar antes de subir.
    expect(resolveAvatarMime(['image/heic'])).toBeNull()
    expect(resolveAvatarMime([undefined, 'image/gif'])).toBeNull()
  })
})

describe('avatarFileName', () => {
  it('da una extensión que PocketBase acepta', () => {
    expect(avatarFileName('image/jpeg')).toBe('avatar.jpg')
    expect(avatarFileName('image/png')).toBe('avatar.png')
    expect(avatarFileName('image/webp')).toBe('avatar.webp')
  })
})

describe('withCacheToken', () => {
  it('encadena con & cuando la url ya trae query (thumb)', () => {
    expect(withCacheToken('https://pb/api/files/u/1/a.jpg?thumb=200x200', '2026-08-14 10:00:00'))
      .toBe('https://pb/api/files/u/1/a.jpg?thumb=200x200&v=2026-08-14%2010%3A00%3A00')
  })

  it('abre la query con ? cuando no la hay', () => {
    expect(withCacheToken('https://pb/a.jpg', 'x')).toBe('https://pb/a.jpg?v=x')
  })

  it('no toca la url sin token, y propaga la ausencia de avatar', () => {
    expect(withCacheToken('https://pb/a.jpg', null)).toBe('https://pb/a.jpg')
    expect(withCacheToken(null, 'x')).toBeNull()
  })
})

describe('MAX_AVATAR_SIZE_BYTES', () => {
  it('coincide con el maxSize del campo users.avatar (5 MB)', () => {
    expect(MAX_AVATAR_SIZE_BYTES).toBe(5242880)
  })
})
