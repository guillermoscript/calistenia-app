import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import LegalPage from './LegalPage'

/**
 * La política de privacidad es el único sitio donde se publica quién ve qué
 * (issue #295). Estos casos no comprueban maquetación: comprueban que las
 * afirmaciones verificadas contra las reglas de PocketBase siguen ahí y que las
 * frases falsas que se borraron no vuelven. Si una regla del backend cambia,
 * el fallo tiene que aparecer aquí y no en un correo de un usuario.
 *
 * La página no pasa por i18n: el castellano va incrustado en el componente, así
 * que los asserts comparan contra el texto real, tildes incluidas.
 */
function renderPage() {
  render(
    <MemoryRouter initialEntries={['/legal']}>
      <LegalPage />
    </MemoryRouter>,
  )
}

/** La tabla de visibilidad, localizada por su caption accesible. */
function visibilityTable() {
  return screen.getByRole('table', { name: /Qué ve cada persona de tus datos/i })
}

describe('LegalPage · privacidad', () => {
  it('enumera las categorias de datos de salud que la app guarda', () => {
    renderPage()
    // Etiqueta exacta del <strong>: «Resúmenes generados por IA» también
    // aparece en el disclaimer médico de las condiciones, y un regex suelto
    // encontraría dos nodos.
    for (const categoria of [
      'Datos sobre tu cuerpo (datos de salud):',
      'Datos de descanso (datos de salud):',
      'Condiciones médicas y lesiones (datos de salud):',
      'Datos de dispositivos de salud (datos de salud):',
      'Resúmenes generados por inteligencia artificial (datos de salud):',
    ]) {
      expect(screen.getByText(categoria)).toBeInTheDocument()
    }
  })

  it('marca como owner-only exactamente lo que las reglas dejan owner-only', () => {
    renderPage()
    const soloTu = within(visibilityTable()).getAllByText('Solo tú.')
    // fotos+medidas+peso, comida+agua+sueno, condiciones medicas, health+IA
    expect(soloTu).toHaveLength(4)
  })

  it('dice que los entrenos los ve cualquier cuenta, no solo quien te sigue', () => {
    renderPage()
    const fila = within(visibilityTable()).getByRole('row', { name: /Entrenos completados/ })
    expect(fila).toHaveTextContent(/Cualquier persona con una cuenta, no solo quienes te siguen/)
  })

  it('avisa de que el bloqueo no oculta series, marcas ni carreras', () => {
    renderPage()
    const tabla = visibilityTable()
    expect(within(tabla).getByRole('row', { name: /Series, repeticiones y marcas/ }))
      .toHaveTextContent(/El bloqueo no las oculta/)
    expect(within(tabla).getByRole('row', { name: /Participaciones en carreras/ }))
      .toHaveTextContent(/El bloqueo no las oculta/)
  })

  it('publica la limitacion de las rutas GPS en vez de omitirla', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Rutas GPS: limitación conocida/ })).toBeInTheDocument()
    expect(screen.getByText(/el servidor no impide leerla/)).toBeInTheDocument()
  })

  it('explica que las fotos se sirven por una direccion no adivinable', () => {
    renderPage()
    expect(screen.getByText(/sin comprobar quién la abre/)).toBeInTheDocument()
  })

  it('nombra a los proveedores que reciben datos', () => {
    renderPage()
    for (const proveedor of [
      /Proveedores de inteligencia artificial \(Anthropic, OpenAI y Google\)/,
      /Langfuse/,
      /Sentry/,
      /OpenPanel/,
      /Expo, Firebase Cloud Messaging/,
      /CARTO/,
    ]) {
      expect(screen.getByText(proveedor)).toBeInTheDocument()
    }
  })

  it('aclara que fotos de progreso, medidas y condiciones médicas no salen a la IA', () => {
    renderPage()
    expect(screen.getByText(/reciben tus fotos de progreso, tus medidas corporales ni tus condiciones médicas/))
      .toBeInTheDocument()
  })

  it('describe la baja autoservicio que existe desde #300, en web y en Android', () => {
    renderPage()
    expect(screen.getByText(/Puedes eliminar tu cuenta tú mismo desde tu perfil/)).toBeInTheDocument()
    expect(screen.getByText(/Te pedimos escribir tu correo para confirmar/)).toBeInTheDocument()
    expect(screen.getByText(/una cuenta eliminada no se puede recuperar/)).toBeInTheDocument()
  })

  it('incluye cardio y carreras entre lo que se borra con la cuenta', () => {
    renderPage()
    // Antes de #300 estas dos categorías se borraban a mano porque su relación
    // con `users` no cascadeaba; ahora caen con el resto.
    expect(screen.getByText(/sesiones de cardio con su ruta GPS, circuitos, participaciones en carreras/))
      .toBeInTheDocument()
  })

  it('describe la exportacion real: dos CSV y solo en web', () => {
    renderPage()
    expect(screen.getByText(/Hoy no hay exportación desde la aplicación de Android/)).toBeInTheDocument()
  })
})

describe('LegalPage · frases retiradas', () => {
  it('ya no dice que el borrado de cuenta no exista ni que haya que pedirlo por correo', () => {
    renderPage()
    expect(screen.queryByText(/Todavía no existe un botón para borrar tu cuenta/)).not.toBeInTheDocument()
    expect(screen.queryByText(/todavía no hay un botón para hacerlo dentro de la aplicación/))
      .not.toBeInTheDocument()
    // Y tampoco vuelve la excepción de cardio/carreras, ya cascadeadas.
    expect(screen.queryByText(/Las eliminamos a mano/)).not.toBeInTheDocument()
  })

  it('ya no dice que Google OAuth sea el unico tercero', () => {
    renderPage()
    expect(screen.queryByText(/No vendemos ni compartimos tu información personal con terceros, excepto/))
      .not.toBeInTheDocument()
  })

  it('ambas secciones llevan la misma fecha de actualizacion', () => {
    renderPage()
    expect(screen.getAllByText(/Última actualización: 31 de julio de 2026/)).toHaveLength(2)
  })
})
