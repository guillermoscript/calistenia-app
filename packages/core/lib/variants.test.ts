import { describe, it, expect } from 'vitest'
import { getVariants, getFamily } from './variants'

describe('variation families', () => {
  it('pushup_std belongs to the push_up family', () => {
    expect(getFamily('pushup_std')).toBe('push_up')
  })

  it('getVariants excludes the exercise itself', () => {
    const variants = getVariants('pushup_std', 50)
    expect(variants.length).toBeGreaterThan(5)
    expect(variants.some(v => v.id === 'pushup_std')).toBe(false)
    expect(variants.every(v => getFamily(v.id) === 'push_up')).toBe(true)
  })

  it('curated variants rank before imported (exercisedb) ones', () => {
    const variants = getVariants('pushup_std', 100)
    const firstImported = variants.findIndex(v => v.source === 'exercisedb')
    const lastCurated = variants.map(v => v.source !== 'exercisedb').lastIndexOf(true)
    if (firstImported !== -1 && lastCurated !== -1) {
      expect(firstImported).toBeGreaterThan(lastCurated)
    }
  })

  it('respects the limit', () => {
    expect(getVariants('pushup_std', 3)).toHaveLength(3)
  })

  it('unknown or family-less ids return []', () => {
    expect(getVariants('nope_does_not_exist')).toEqual([])
    expect(getFamily('nope_does_not_exist')).toBeNull()
  })
})
