import { describe, it, expect } from 'vitest'
import { swap, removeAt, moveItem } from './reorder'

describe('swap', () => {
  it('intercambia dos índices sin mutar el array original', () => {
    const original = ['a', 'b', 'c']
    const result = swap(original, 0, 2)
    expect(result).toEqual(['c', 'b', 'a'])
    expect(original).toEqual(['a', 'b', 'c'])
  })
})

describe('removeAt', () => {
  it('devuelve una copia sin el elemento en el índice dado', () => {
    const original = ['a', 'b', 'c']
    const result = removeAt(original, 1)
    expect(result).toEqual(['a', 'c'])
    expect(original).toEqual(['a', 'b', 'c'])
  })
})

describe('moveItem', () => {
  it('mueve un elemento a la posición anterior (onMoveUp)', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c'])
  })

  it('mueve un elemento a la posición siguiente (onMoveDown)', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'c', 'b'])
  })

  it('coincide con mover por splice para movimientos adyacentes (semántica de CircuitBuilder)', () => {
    const spliceMove = <T,>(items: T[], from: number, to: number): T[] => {
      const next = [...items]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    }
    const list = ['a', 'b', 'c', 'd']
    for (let i = 0; i < list.length; i++) {
      if (i - 1 >= 0) expect(moveItem(list, i, i - 1)).toEqual(spliceMove(list, i, i - 1))
      if (i + 1 < list.length) expect(moveItem(list, i, i + 1)).toEqual(spliceMove(list, i, i + 1))
    }
  })

  it('devuelve el mismo array (misma referencia) si `to` queda fuera de rango', () => {
    const original = ['a', 'b', 'c']
    expect(moveItem(original, 0, -1)).toBe(original)
    expect(moveItem(original, 2, 3)).toBe(original)
  })

  it('devuelve el mismo array si `from` y `to` son iguales', () => {
    const original = ['a', 'b', 'c']
    expect(moveItem(original, 1, 1)).toBe(original)
  })
})
