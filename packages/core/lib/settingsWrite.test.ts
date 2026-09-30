import { describe, it, expect, vi } from 'vitest'
import { saveSettingsRecord, saveSettingsSerial, type SettingsClient } from './settingsWrite'

const abort = () => Object.assign(new Error('cancelled'), { isAbort: true, status: 0 })

function client(over: { items?: Array<{ id: string }>; update?: () => Promise<unknown>; create?: () => Promise<unknown> }) {
  const update = vi.fn(over.update ?? (async () => ({})))
  const create = vi.fn(over.create ?? (async () => ({})))
  const c: SettingsClient = {
    filter: (raw, p) => raw.replace('{:uid}', `"${p.uid}"`),
    collection: () => ({ getList: async () => ({ items: over.items ?? [] }), update, create }),
  }
  return { c, update, create }
}

describe('saveSettingsRecord', () => {
  it('actualiza la fila existente sin auto-cancelar', async () => {
    const { c, update, create } = client({ items: [{ id: 'r1' }] })
    await saveSettingsRecord(c, 'u1', { weekly_goal: 3 })
    expect(update).toHaveBeenCalledWith('r1', { weekly_goal: 3 }, { $autoCancel: false })
    expect(create).not.toHaveBeenCalled()
  })

  it('crea si no hay fila', async () => {
    const { c, create } = client({ items: [] })
    await saveSettingsRecord(c, 'u1', { weekly_goal: 3 })
    expect(create).toHaveBeenCalledWith({ user: 'u1', weekly_goal: 3 }, { $autoCancel: false })
  })

  it('una petición cancelada NO es «no existe»: no crea ni lanza', async () => {
    const { c, create } = client({ items: [{ id: 'r1' }], update: async () => { throw abort() } })
    await expect(saveSettingsRecord(c, 'u1', {})).resolves.toBeUndefined()
    expect(create).not.toHaveBeenCalled()
  })

  it('un 404 al actualizar cae en crear', async () => {
    const { c, create } = client({ items: [{ id: 'r1' }], update: async () => { throw Object.assign(new Error('x'), { status: 404 }) } })
    await saveSettingsRecord(c, 'u1', {})
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('otros errores se propagan', async () => {
    const { c } = client({ items: [{ id: 'r1' }], update: async () => { throw Object.assign(new Error('x'), { status: 500 }) } })
    await expect(saveSettingsRecord(c, 'u1', {})).rejects.toThrow('x')
  })
})

describe('saveSettingsSerial', () => {
  it('los guardados del mismo usuario van en orden', async () => {
    const order: string[] = []
    let n = 0
    const c: SettingsClient = {
      filter: () => '',
      collection: () => ({
        getList: async () => ({ items: [{ id: 'r' }] }),
        update: async (_id, d) => { const i = ++n; await new Promise(r => setTimeout(r, i === 1 ? 20 : 0)); order.push(String(d.k)) },
        create: async () => ({}),
      }),
    }
    await Promise.all([saveSettingsSerial(c, 'u', { k: 'a' }), saveSettingsSerial(c, 'u', { k: 'b' })])
    expect(order).toEqual(['a', 'b'])
  })
})
