#!/usr/bin/env node
/**
 * play-api.mjs — Cliente mínimo de la Google Play Android Publisher API v3.
 *
 * Sin dependencias: firma el JWT del service account con node:crypto y habla
 * REST con fetch. Se usa desde play-status.mjs y publish-play.mjs.
 *
 * Credenciales: JSON del service account, en este orden
 *   1. $GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  (ruta al fichero)
 *   2. ~/keystores/calistenia-play-service-account.json
 *
 * Ver .agents/skills/changelog-automation/references/play-publishing.md para
 * el alta del service account en Google Cloud + Play Console.
 */

import { createSign } from 'crypto'
import { readFileSync, existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const UPLOAD_API = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'

const DEFAULT_KEY_PATH = resolve(homedir(), 'keystores/calistenia-play-service-account.json')

// ── Auth ─────────────────────────────────────────────────────────────────────

function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

export function credentialsPath() {
  return process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || DEFAULT_KEY_PATH
}

export function loadCredentials() {
  const path = credentialsPath()
  if (!existsSync(path)) {
    throw new Error(
      `No encuentro las credenciales del service account en:\n  ${path}\n\n` +
        'Crea el service account y descarga su JSON (una sola vez):\n' +
        '  .agents/skills/changelog-automation/references/play-publishing.md\n\n' +
        'Luego: export GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=/ruta/al/key.json',
    )
  }
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  if (!raw.client_email || !raw.private_key) {
    throw new Error(`${path} no parece la clave de un service account (falta client_email/private_key).`)
  }
  return raw
}

/** Intercambia el JWT del service account por un access token OAuth2. */
export async function getAccessToken() {
  const creds = loadCredentials()
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(creds.private_key).toString('base64url')
  const assertion = `${header}.${claims}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`OAuth falló (${res.status}): ${JSON.stringify(body)}`)
  }
  return { token: body.access_token, email: creds.client_email }
}

// ── Cliente ──────────────────────────────────────────────────────────────────

export class PlayClient {
  constructor(token, packageName) {
    this.token = token
    this.pkg = packageName
    this.editId = null
  }

  static async create(packageName) {
    const { token, email } = await getAccessToken()
    const client = new PlayClient(token, packageName)
    client.serviceAccountEmail = email
    return client
  }

  async request(path, { method = 'GET', body, query } = {}) {
    const url = new URL(`${API}/applications/${this.pkg}${path}`)
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v))
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    const parsed = text ? JSON.parse(text) : {}
    if (!res.ok) {
      // El 403 aquí casi siempre es lo mismo: las credenciales son válidas (el
      // token se emitió) pero al service account no le han dado acceso a la app
      // en Play Console. Sin este mensaje se lee como un fallo de la clave.
      const hint =
        res.status === 403
          ? `\n\n   La clave es válida (Google emitió el token), pero el service account\n` +
            `   no tiene permiso sobre ${this.pkg}. En Play Console:\n` +
            `     Usuarios y permisos → Invitar usuario\n` +
            `     correo: ${this.serviceAccountEmail || '(el client_email del JSON)'}\n` +
            `     Permisos de la app → Calistenia → «Ver información de la app»\n` +
            `     + «Administrar versiones de pruebas»\n` +
            `   Tarda unos minutos en propagar.`
          : ''
      const err = new Error(
        `Play API ${method} ${path} → ${res.status}: ${parsed?.error?.message || text}${hint}`,
      )
      err.status = res.status
      err.body = parsed
      throw err
    }
    return parsed
  }

  // — Edits —

  async openEdit() {
    const edit = await this.request('/edits', { method: 'POST' })
    this.editId = edit.id
    return edit.id
  }

  async deleteEdit() {
    if (!this.editId) return
    try {
      await this.request(`/edits/${this.editId}`, { method: 'DELETE' })
    } catch {
      // un edit huérfano caduca solo; no merece la pena romper por esto
    }
    this.editId = null
  }

  async commitEdit({ changesNotSentForReview = false } = {}) {
    return this.request(`/edits/${this.editId}:commit`, {
      method: 'POST',
      query: changesNotSentForReview ? { changesNotSentForReview: true } : undefined,
    })
  }

  // — Lecturas —

  /** Todos los bundles (AAB) que Play tiene registrados para la app. */
  async listBundles() {
    const { bundles = [] } = await this.request(`/edits/${this.editId}/bundles`)
    return bundles
  }

  async listApks() {
    const { apks = [] } = await this.request(`/edits/${this.editId}/apks`)
    return apks
  }

  async listTracks() {
    const { tracks = [] } = await this.request(`/edits/${this.editId}/tracks`)
    return tracks
  }

  /** Idiomas de ficha publicados (es-419, en-US...): a los que Play acepta notas. */
  async listListingLanguages() {
    const { listings = [] } = await this.request(`/edits/${this.editId}/listings`)
    return listings.map((l) => l.language)
  }

  // — Escrituras —

  /** Sube un .aab. Devuelve { versionCode, sha256 }. */
  async uploadBundle(aabPath, { onProgress } = {}) {
    const size = statSync(aabPath).size
    onProgress?.(`Subiendo ${(size / 1024 / 1024).toFixed(1)} MB...`)
    const body = readFileSync(aabPath)
    const url = `${UPLOAD_API}/applications/${this.pkg}/edits/${this.editId}/bundles?uploadType=media`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/octet-stream',
        'content-length': String(size),
      },
      body,
    })
    const text = await res.text()
    const parsed = text ? JSON.parse(text) : {}
    if (!res.ok) {
      throw new Error(`Subida del AAB falló (${res.status}): ${parsed?.error?.message || text}`)
    }
    return parsed
  }

  /** Asigna versionCodes a un track con sus notas de versión. */
  async updateTrack(track, release) {
    return this.request(`/edits/${this.editId}/tracks/${track}`, {
      method: 'PUT',
      body: { track, releases: [release] },
    })
  }
}

export const TRACKS = ['internal', 'alpha', 'beta', 'production']
