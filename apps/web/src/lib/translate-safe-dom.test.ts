import { describe, it, expect, beforeAll } from 'vitest'
import { installTranslateSafeDom } from './translate-safe-dom'

// Lo que hace el traductor de Chrome: saca el nodo de texto del `<span>` y lo
// mete en un `<font>` propio, dejando el `<span>` con OTRO hijo.
function translate(el: HTMLElement) {
  const text = el.firstChild!
  const font = document.createElement('font')
  el.removeChild(text)
  font.appendChild(text)
  el.appendChild(font)
  return text
}

describe('installTranslateSafeDom', () => {
  beforeAll(() => { installTranslateSafeDom() })

  it('no lanza al borrar un nodo que el traductor ya movió de padre', () => {
    const span = document.createElement('span')
    span.textContent = 'IMC actual 24,2'
    document.body.appendChild(span)
    const text = translate(span)

    // Esto es lo que hace React al desmontar: borra el nodo de texto contra el
    // padre que él anotó, que ya no es el suyo.
    expect(() => span.removeChild(text)).not.toThrow()
    expect(span.removeChild(text)).toBe(text)
  })

  it('sigue borrando de verdad cuando el nodo sí es hijo', () => {
    const parent = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)

    expect(parent.removeChild(child)).toBe(child)
    expect(parent.childNodes.length).toBe(0)
  })

  it('no lanza al insertar ante una referencia que el traductor movió', () => {
    const span = document.createElement('span')
    span.textContent = 'IMC objetivo 22,1'
    const text = translate(span)
    const nuevo = document.createElement('b')

    expect(() => span.insertBefore(nuevo, text)).not.toThrow()
    expect(span.contains(nuevo)).toBe(true)
  })

  it('sigue respetando la posición cuando la referencia sí es hija', () => {
    const parent = document.createElement('div')
    const a = document.createElement('a')
    const b = document.createElement('b')
    parent.appendChild(a)
    parent.insertBefore(b, a)

    expect(parent.firstChild).toBe(b)
    expect(parent.lastChild).toBe(a)
  })
})
