import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchMealMedia, pickPreciseMeal, scaleQty, MAX_SERVINGS } from './recipe-media'

const hit = (strMeal: string, extra: Record<string, unknown> = {}) => ({
  strMeal, strMealThumb: `https://img/${strMeal.replace(/\s/g, '-')}.jpg`, ...extra,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pickPreciseMeal', () => {
  it('acepta el plato cuyo nombre contiene todas las palabras de la query', () => {
    expect(pickPreciseMeal('chicken curry', [hit('Chicken Curry')])?.thumb)
      .toBe('https://img/Chicken-Curry.jpg')
  })

  it('devuelve el vídeo y la fuente cuando vienen, y null cuando faltan', () => {
    const conTodo = pickPreciseMeal('chicken curry', [
      hit('Chicken Curry', { strYoutube: 'https://yt/1', strSource: 'https://src/1' }),
    ])
    expect(conTodo).toEqual({ thumb: 'https://img/Chicken-Curry.jpg', youtube: 'https://yt/1', source: 'https://src/1' })
    // La API devuelve '' en vez de null cuando no hay vídeo: no debe colarse.
    expect(pickPreciseMeal('chicken curry', [hit('Chicken Curry', { strYoutube: '', strSource: '' })]))
      .toEqual({ thumb: 'https://img/Chicken-Curry.jpg', youtube: null, source: null })
  })

  it('rechaza el plato al que le falta alguna palabra de la query', () => {
    expect(pickPreciseMeal('chicken curry', [hit('Beef Curry')])).toBeNull()
  })

  it('con query de una sola palabra no tolera ninguna palabra extra', () => {
    expect(pickPreciseMeal('curry', [hit('Chicken Curry')])).toBeNull()
    expect(pickPreciseMeal('curry', [hit('Curry')])).not.toBeNull()
  })

  it('con query de varias palabras tolera una extra, pero no dos', () => {
    expect(pickPreciseMeal('chicken curry', [hit('Thai Chicken Curry')])).not.toBeNull()
    expect(pickPreciseMeal('chicken curry', [hit('Thai Green Chicken Curry')])).toBeNull()
  })

  it('entre varios candidatos válidos gana el que menos palabras sobrantes tiene', () => {
    const media = pickPreciseMeal('chicken curry', [hit('Thai Chicken Curry'), hit('Chicken Curry')])
    expect(media?.thumb).toBe('https://img/Chicken-Curry.jpg')
  })

  it('tolera el plural en cualquiera de los dos lados', () => {
    expect(pickPreciseMeal('pancakes', [hit('Pancake')])).not.toBeNull()
    expect(pickPreciseMeal('pancake', [hit('Pancakes')])).not.toBeNull()
  })

  it('ignora las palabras de menos de 3 letras de la query', () => {
    // 'de' no cuenta como palabra, así que 'pie' es la única exigida.
    expect(pickPreciseMeal('pie de', [hit('Pie')])).not.toBeNull()
  })

  it('sin palabras aprovechables devuelve null en vez de una foto al azar', () => {
    expect(pickPreciseMeal('a de', [hit('Pie')])).toBeNull()
  })

  it('descarta los candidatos sin foto: el thumb es el punto', () => {
    expect(pickPreciseMeal('chicken curry', [{ strMeal: 'Chicken Curry' }])).toBeNull()
  })
})

describe('fetchMealMedia', () => {
  it('query vacía no llega a tocar la red', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchMealMedia('   ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('junta los candidatos de la query completa y de cada palabra larga', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      ({ ok: true, json: async () => ({ meals: url.includes('curry') ? [hit('Chicken Curry')] : [] }) }))
    vi.stubGlobal('fetch', fetchMock)

    const media = await fetchMealMedia('Chicken Curry')
    expect(media?.thumb).toBe('https://img/Chicken-Curry.jpg')
    // query completa + 'chicken' + 'curry'
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('cachea el resultado: la misma query no vuelve a la red', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ meals: [hit('Ratatouille')] }) }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await fetchMealMedia('ratatouille')
    const calls = fetchMock.mock.calls.length
    const second = await fetchMealMedia('  RATATOUILLE  ')
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  })

  it('un fallo de red no propaga: se queda sin foto y lo cachea', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('offline') })
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchMealMedia('sopa fallona')).toBeNull()
    const calls = fetchMock.mock.calls.length
    expect(await fetchMealMedia('sopa fallona')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  })

  it('una respuesta no-ok cuenta como fallo, no como "sin resultados"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    expect(await fetchMealMedia('plato quinientos tres')).toBeNull()
  })

  it('meals: null (lo que devuelve la API cuando no hay nada) no rompe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ meals: null }) })))
    expect(await fetchMealMedia('plato inexistente')).toBeNull()
  })
})

describe('scaleQty', () => {
  it('escala sin dejar colas de float', () => {
    expect(scaleQty(3, 1.5)).toBe('4.5')
    expect(scaleQty(100, 2)).toBe('200')
    expect(scaleQty(0.1, 3)).toBe('0.3')
  })

  it('el factor 1 deja la cantidad como estaba', () => {
    expect(scaleQty(250, 1)).toBe('250')
  })
})

describe('MAX_SERVINGS', () => {
  it('el stepper de porciones tope en 8', () => {
    expect(MAX_SERVINGS).toBe(8)
  })
})
