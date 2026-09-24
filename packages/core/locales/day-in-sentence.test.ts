import { describe, it, expect } from 'vitest'
import es from './es/translation.json'
import en from './en/translation.json'

// Guardarraíl de `day.inSentence.<id>` (#825): en español el nombre del día
// va en minúscula dentro de una frase («vuelve el jueves»), a diferencia de
// `day.<id>` («Jueves»), que es la etiqueta suelta que usan cabeceras y
// selectores. En inglés el día siempre va capitalizado, en los dos sitios.
const IDS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const

describe('day.inSentence.<id> (#825)', () => {
  it('es: siempre en minúscula', () => {
    for (const id of IDS) {
      const value = (es as Record<string, string>)[`day.inSentence.${id}`]
      expect(value, `falta day.inSentence.${id} en es`).toBeTruthy()
      expect(value).toBe(value.toLowerCase())
    }
  })

  it('en: igual que la etiqueta suelta day.<id> (siempre capitalizado)', () => {
    for (const id of IDS) {
      const sentence = (en as Record<string, string>)[`day.inSentence.${id}`]
      const label = (en as Record<string, string>)[`day.${id}`]
      expect(sentence, `falta day.inSentence.${id} en en`).toBeTruthy()
      expect(sentence).toBe(label)
    }
  })
})
