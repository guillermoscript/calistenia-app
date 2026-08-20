import { describe, expect, it } from 'vitest'

import {
  getMessageText,
  getSearchParts,
  getSessionParts,
  getSessionFromParts,
  hasAssistantContent,
  parseExercisesFromText,
  type FreeSessionPart,
} from './ai-message-parts'

describe('getMessageText', () => {
  it('concatena solo los text parts, ignorando las tool-parts', () => {
    const parts = [
      { type: 'text', text: 'Hola ' } as FreeSessionPart,
      {
        type: 'tool-search_exercises',
        toolCallId: 'call-1',
        state: 'input-available',
        input: { category: 'push' },
      } as FreeSessionPart,
      { type: 'text', text: 'mundo' } as FreeSessionPart,
    ]
    expect(getMessageText(parts)).toBe('Hola mundo')
  })

  it('devuelve la cadena vacía para un array vacío', () => {
    expect(getMessageText([])).toBe('')
  })
})

describe('getSearchParts / getSessionParts', () => {
  it('filtran por type preservando el orden e ignorando otros types', () => {
    const search1 = {
      type: 'tool-search_exercises',
      toolCallId: 'call-1',
      state: 'input-available',
      input: { category: 'push' },
    } as FreeSessionPart
    const session1 = {
      type: 'tool-create_session',
      toolCallId: 'call-2',
      state: 'input-streaming',
      input: undefined,
    } as FreeSessionPart
    const search2 = {
      type: 'tool-search_exercises',
      toolCallId: 'call-3',
      state: 'output-available',
      input: { category: 'pull' },
      output: { found: 3 },
    } as FreeSessionPart
    const text = { type: 'text', text: 'texto' } as FreeSessionPart

    const parts = [search1, text, session1, search2]

    expect(getSearchParts(parts)).toEqual([search1, search2])
    expect(getSessionParts(parts)).toEqual([session1])
  })
})

describe('getSessionFromParts', () => {
  const exercises = [{ id: 'ex-1', sets: 3, reps: '10', rest: 60 }]

  it('devuelve output.exercises para tool-create_session en output-available', () => {
    const parts = [
      {
        type: 'tool-create_session',
        toolCallId: 'call-1',
        state: 'output-available',
        input: undefined,
        output: { success: true, exercises, exercise_count: exercises.length },
      } as FreeSessionPart,
    ]
    expect(getSessionFromParts(parts)).toEqual(exercises)
  })

  it('devuelve null cuando el state es input-available', () => {
    const parts = [
      {
        type: 'tool-create_session',
        toolCallId: 'call-1',
        state: 'input-available',
        input: { count: 5 },
      } as FreeSessionPart,
    ]
    expect(getSessionFromParts(parts)).toBeNull()
  })

  it('devuelve null cuando el state es output-error', () => {
    const parts = [
      {
        type: 'tool-create_session',
        toolCallId: 'call-1',
        state: 'output-error',
        input: undefined,
        errorText: 'boom',
      } as FreeSessionPart,
    ]
    expect(getSessionFromParts(parts)).toBeNull()
  })

  it('devuelve null cuando exercises está vacío', () => {
    const parts = [
      {
        type: 'tool-create_session',
        toolCallId: 'call-1',
        state: 'output-available',
        input: undefined,
        output: { success: true, exercises: [], exercise_count: 0 },
      } as FreeSessionPart,
    ]
    expect(getSessionFromParts(parts)).toBeNull()
  })

  it('devuelve null para una part con forma v4 (tool-invocation/result) — issue #557: la forma v4 ya no se reconoce', () => {
    const legacyV4Part = {
      type: 'tool-invocation',
      toolName: 'create_session',
      state: 'result',
      result: { success: true, exercises, exercise_count: exercises.length },
    } as unknown as FreeSessionPart
    expect(getSessionFromParts([legacyV4Part])).toBeNull()
  })
})

describe('hasAssistantContent', () => {
  it('false para un array vacío', () => {
    expect(hasAssistantContent([])).toBe(false)
  })

  it('false cuando el único text part está vacío', () => {
    const parts = [{ type: 'text', text: '' } as FreeSessionPart]
    expect(hasAssistantContent(parts)).toBe(false)
  })

  it('true cuando hay texto no vacío', () => {
    const parts = [{ type: 'text', text: 'hola' } as FreeSessionPart]
    expect(hasAssistantContent(parts)).toBe(true)
  })

  it('true para una tool-part en input-streaming', () => {
    const parts = [
      {
        type: 'tool-search_exercises',
        toolCallId: 'call-1',
        state: 'input-streaming',
        input: undefined,
      } as FreeSessionPart,
    ]
    expect(hasAssistantContent(parts)).toBe(true)
  })
})

describe('parseExercisesFromText', () => {
  it('parsea un bloque ```json con { exercises: [...] }', () => {
    const text = [
      'Aquí tienes la sesión:',
      '```json',
      '{ "exercises": [{ "id": "ex-1", "sets": 3, "reps": "10", "rest": 60 }] }',
      '```',
    ].join('\n')
    expect(parseExercisesFromText(text)).toEqual([
      { id: 'ex-1', sets: 3, reps: '10', rest: 60 },
    ])
  })

  it('parsea un array desnudo', () => {
    const text = '```json\n[{ "id": "ex-1", "sets": 3, "reps": "10", "rest": 60 }]\n```'
    expect(parseExercisesFromText(text)).toEqual([
      { id: 'ex-1', sets: 3, reps: '10', rest: 60 },
    ])
  })

  it('filtra las entradas sin id de tipo string', () => {
    const text = [
      '```json',
      '[',
      '{ "id": "ex-1", "sets": 3, "reps": "10", "rest": 60 },',
      '{ "sets": 3, "reps": "10", "rest": 60 },',
      '{ "id": 42, "sets": 3, "reps": "10", "rest": 60 }',
      ']',
      '```',
    ].join('\n')
    expect(parseExercisesFromText(text)).toEqual([
      { id: 'ex-1', sets: 3, reps: '10', rest: 60 },
    ])
  })

  it('devuelve [] cuando no hay bloque ```json', () => {
    expect(parseExercisesFromText('solo texto plano, sin bloques')).toEqual([])
  })

  it('devuelve [] cuando el bloque tiene JSON inválido', () => {
    const text = '```json\n{ esto no es json válido \n```'
    expect(parseExercisesFromText(text)).toEqual([])
  })

  it('salta un bloque inválido y usa el siguiente bloque válido', () => {
    const text = [
      '```json',
      '{ esto no es json válido',
      '```',
      'texto intermedio',
      '```json',
      '{ "exercises": [{ "id": "ex-2", "sets": 4, "reps": "8", "rest": 90 }] }',
      '```',
    ].join('\n')
    expect(parseExercisesFromText(text)).toEqual([
      { id: 'ex-2', sets: 4, reps: '8', rest: 90 },
    ])
  })
})
