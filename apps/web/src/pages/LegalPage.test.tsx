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

  // #299 cerró el agujero del cardio pero NO el de las carreras
  // (`race_participants.gps_track` sigue siendo legible por cualquier cuenta),
  // así que la página tiene que seguir avisando, ahora acotado a carreras.
  it('publica la limitacion de las rutas GPS de carreras en vez de omitirla', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Rutas GPS de carreras: limitación conocida/ })).toBeInTheDocument()
    expect(screen.getByText(/el servidor tampoco impide leerlo/)).toBeInTheDocument()
  })

  it('deja claro que la ruta de cardio ya solo la ve su dueño', () => {
    renderPage()
    expect(within(visibilityTable()).getByRole('row', { name: /La ruta GPS de tus sesiones de cardio/ }))
      .toHaveTextContent(/Solo tú/)
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

  it('dice que no hay boton de baja y nombra lo que aun se borra a mano', () => {
    renderPage()
    expect(screen.getByText(/Todavía no existe un botón para borrar tu cuenta/)).toBeInTheDocument()
    // Tras #299 cardio y carreras ya cascadean; lo que queda a mano son las
    // otras cuatro relaciones required sin cascade (territorio de #300).
    expect(screen.getByText(/tus sesiones de circuito, las carreras que hayas creado, tus invitaciones a otras personas y las denuncias en las que aparezcas/))
      .toBeInTheDocument()
  })

  it('describe la exportacion real: dos CSV y solo en web', () => {
    renderPage()
    expect(screen.getByText(/Hoy no hay exportación desde la aplicación de Android/)).toBeInTheDocument()
  })
})

describe('LegalPage · frases retiradas', () => {
  it('ya no promete un borrado de cuenta autoservicio que no existe', () => {
    renderPage()
    expect(screen.queryByText(/desde la configuración de tu perfil/)).not.toBeInTheDocument()
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
