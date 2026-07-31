import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const UPDATED = '31 de julio de 2026'

/**
 * Política de privacidad y condiciones (issue #295).
 *
 * El fichero venía sin una sola tilde desde su primera versión. Como esta
 * revisión reescribe la mayor parte del texto, se acentúa entero: dejar a
 * medias un documento legal en castellano desluce más que el ruido que añade
 * al diff.
 *
 * Cada afirmación de la sección de privacidad está anclada al código que la
 * sostiene, para que la próxima revisión pueda comprobarla en vez de creérsela:
 *
 * - Colecciones de salud, todas owner-only: `body_photos` (1774000008:101,106),
 *   `body_measurements` (1774000022:88,93), `weight_entries` (1774000007:81,86),
 *   `sleep_entries` (1774000042:28,29), `user_health` (1781700000:35,36),
 *   `user_insights` (1780000000:87,92), `sleep_insights` (1781400000:87,92),
 *   `nutrition_entries` (1774000004:160,165), `daily_health_cache` (1777000001:36,37).
 * - Legibles por cualquier cuenta autenticada: `sessions`, `user_stats` y
 *   `cardio_sessions` con filtro de bloqueo (1778000002:11-22,27-31), y
 *   `sets_log` (1777000005:12,13), `settings` (1775100007:14,15) y
 *   `race_participants` (1775200002:27,28) SIN filtro de bloqueo.
 * - Rutas GPS de cardio: RESUELTO en #299. `gps_points` salió de
 *   `cardio_sessions` a la colección owner-only `cardio_routes` (1782500000),
 *   con las cinco reglas atadas al dueño. El muro sigue abierto pero ya no
 *   arrastra la ruta.
 * - Rutas GPS de carreras: SIGUE ABIERTO. `race_participants.gps_track`
 *   (1776000002:19-22) es un campo json normal de una colección legible por
 *   cualquier cuenta autenticada (1775200002:27,28), sin filtro de bloqueo.
 *   Mismo agujero que tenía el cardio, en la colección de al lado.
 * - Ficheros con `protected: false`: fotos de progreso (1774000008:50) y de
 *   comida (1774000064:18) -> URL larga sin comprobación de sesión.
 * - Borrado de cuenta: `cardio_sessions` y `race_participants` ya cascadean
 *   (1782500001). Siguen SIN cascadear, y además bloquean el borrado del
 *   registro de usuario por ser relaciones required: `referrals.referrer`,
 *   `referrals.referred`, `circuit_sessions.user`, `races.creator` y
 *   `content_reports.target_user`. Es territorio de #300.
 * - Terceros: proveedores de IA en `mcp-server/src/api/model-resolver.ts:22-32`,
 *   fotos de comida enviadas en `meal-analyzer.ts:204-213`, contexto de los
 *   resúmenes en `insight-context-server.ts:468-679`, Langfuse sin enmascarado
 *   en `mcp-server/src/instrumentation.ts:22-24`, Sentry web con PII en
 *   `apps/web/src/instrument.ts:12`, móvil sin ella en
 *   `apps/mobile/src/lib/instrument.ts:15`, OpenPanel autoalojado en
 *   `apps/web/src/lib/init-core.ts:12` con session replay enmascarado salvo en
 *   los subárboles `data-op-unmask` (`components/MarketingUnmask.tsx`)
 *   e identify con email en
 *   `packages/core/hooks/useAuth.ts:70,119`, push en `push-sender.ts:100-174`,
 *   mapas CARTO en `apps/web/src/components/cardio/RouteMap.tsx:21-22`.
 * - Cron semanal de resúmenes: `pb_hooks/weekly_insights.pb.js:13,22-35`
 *   (enumera usuarios con token push, no todos).
 * - Exportación: `apps/web/src/components/progress/ExportData.tsx:55-65`.
 * - Condiciones médicas y lesiones NO salen a la IA: solo se usan en cliente
 *   (`packages/core/lib/matchPrograms.ts:78-79`, `lib/injuryMatch.ts`).
 * - No existe borrado de cuenta autoservicio en ninguna plataforma (#300).
 */

/** Fila de la tabla de visibilidad: `who` admite varias frases. */
function VisibilityRow({ what, who }: { what: string; who: string }) {
  return (
    <tr className="border-b border-border last:border-b-0 align-top">
      <th scope="row" className="py-3 pr-4 text-left font-medium">{what}</th>
      <td className="py-3 text-muted-foreground">{who}</td>
    </tr>
  )
}

export default function LegalPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const hash = location.hash

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.replace('#', ''))
      el?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [hash])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Volver
        </button>

        {/* Privacy Policy */}
        <section id="privacy" className="mb-16">
          <h1 className="text-3xl font-bold mb-2">Política de Privacidad</h1>
          <p className="text-sm text-muted-foreground mb-6">Última actualización: {UPDATED}</p>

          <p className="mb-4">
            Calistenia App ("nosotros", "nuestro" o "la aplicación") se compromete a proteger tu privacidad.
            Esta política describe cómo recopilamos, usamos y protegemos tu información personal cuando
            utilizas nuestra aplicación.
          </p>

          <p className="mb-4">
            La aplicación guarda datos sobre tu cuerpo y tu salud, así que esta política describe lo que
            ocurre hoy con detalle, incluidas las partes incómodas. Cuando algo no funciona como te
            gustaría, lo decimos en vez de omitirlo.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">1. Información que recopilamos</h2>
          <p className="mb-2">
            Casi todo lo que sigue lo introduces tú. Si no rellenas una sección, esos datos no existen.
            Marcamos como <strong>datos de salud</strong> las categorías que merecen ese trato.
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li><strong>Datos de cuenta:</strong> nombre, dirección de correo electrónico y foto de perfil cuando te registras o inicias sesión con Google, además de tu idioma y tu zona horaria.</li>
            <li><strong>Datos de entrenamiento:</strong> ejercicios, series, repeticiones, pesos, notas, sesiones completadas, circuitos, programas y tus marcas personales de dominadas, flexiones, L-sit, pistol y parada de manos.</li>
            <li><strong>Datos de cardio y ubicación:</strong> distancia, ritmo, desnivel y la ruta GPS completa de la sesión. La ubicación se registra únicamente mientras una sesión de cardio está activa.</li>
            <li><strong>Datos de nutrición:</strong> comidas, cantidades, objetivos, agua, despensa, recetas guardadas y las fotos de comida que subas.</li>
            <li><strong>Datos sobre tu cuerpo (datos de salud):</strong> peso, hasta ocho circunferencias corporales (pecho, cintura, cuello, cadera, ambos brazos y ambos muslos), el porcentaje de grasa que se estima a partir de ellas, y las fotos de progreso de frente, de lado y de espalda.</li>
            <li><strong>Datos de descanso (datos de salud):</strong> hora de acostarte y de levantarte, duración, despertares, calidad percibida, cafeína, pantallas antes de dormir y nivel de estrés.</li>
            <li><strong>Condiciones médicas y lesiones (datos de salud):</strong> las que declares en el registro o en tu perfil. Se usan para adaptar las recomendaciones de programas y no salen de tu dispositivo hacia ningún servicio de terceros.</li>
            <li><strong>Datos de dispositivos de salud (datos de salud):</strong> si conectas Health Connect en Android, la aplicación guarda un resumen diario con pasos, calorías, pulsaciones en reposo, variabilidad, VO2max, minutos y calidad de sueño, peso y porcentaje de grasa.</li>
            <li><strong>Resúmenes generados por inteligencia artificial (datos de salud):</strong> los textos semanales que la aplicación genera sobre tus propios registros y guarda en tu cuenta.</li>
            <li><strong>Datos del dispositivo y de uso:</strong> tipo de navegador, sistema operativo, idioma, versión de la aplicación y eventos de uso, utilizados para mejorar la experiencia y diagnosticar fallos.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">2. Cómo usamos tu información</h2>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Proporcionar, mantener y mejorar los servicios de la aplicación.</li>
            <li>Personalizar tu experiencia de entrenamiento y nutrición.</li>
            <li>Permitir funciones sociales como amigos, ranking y desafíos.</li>
            <li>Estimar los valores nutricionales de las fotos de comida que envíes a analizar.</li>
            <li>Generar resúmenes semanales sobre tus registros. Esto ocurre de forma automática los lunes por la mañana, sin que lo pidas, si tienes las notificaciones activadas en algún dispositivo.</li>
            <li>Enviar recordatorios y notificaciones que hayas configurado.</li>
            <li>Detectar y diagnosticar errores de la aplicación.</li>
            <li>Analizar el uso para mejorar la aplicación.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">3. Quién ve tus datos dentro de la aplicación</h2>
          <p className="mb-4">
            No hay perfiles públicos: sin una cuenta con la sesión iniciada no se ve absolutamente nada.
            Con una cuenta, esto es lo que se ve.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <caption className="sr-only">Qué ve cada persona de tus datos</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-4 text-left font-semibold">Dato</th>
                  <th scope="col" className="py-2 text-left font-semibold">Quién puede verlo</th>
                </tr>
              </thead>
              <tbody>
                <VisibilityRow
                  what="Fotos de progreso, medidas y peso"
                  who="Solo tú."
                />
                <VisibilityRow
                  what="Comidas, fotos de comida, agua y sueño"
                  who="Solo tú."
                />
                <VisibilityRow
                  what="Condiciones médicas y lesiones"
                  who="Solo tú."
                />
                <VisibilityRow
                  what="Datos de Health Connect y resúmenes generados por IA"
                  who="Solo tú."
                />
                <VisibilityRow
                  what="Entrenos completados y estadísticas generales"
                  who="Cualquier persona con una cuenta, no solo quienes te siguen. Se ocultan a quien hayas bloqueado y a quien te haya bloqueado."
                />
                <VisibilityRow
                  what="Series, repeticiones y marcas personales"
                  who="Cualquier persona con una cuenta: son los datos que hacen funcionar la clasificación y los retos. El bloqueo no las oculta."
                />
                <VisibilityRow
                  what="Sesiones de cardio: distancia, ritmo y duración"
                  who="Cualquier persona con una cuenta, no solo quienes te siguen. Se ocultan a quien hayas bloqueado y a quien te haya bloqueado."
                />
                <VisibilityRow
                  what="La ruta GPS de tus sesiones de cardio"
                  who="Solo tú. Se guarda aparte del resto de la sesión, precisamente para que el muro pueda mostrar la actividad sin exponer por dónde pasaste."
                />
                <VisibilityRow
                  what="Participaciones en carreras, incluido el recorrido registrado"
                  who="Cualquier persona con una cuenta. El bloqueo no las oculta. Lo explicamos con detalle más abajo."
                />
                <VisibilityRow
                  what="Tu nombre, tu foto y tus estadísticas"
                  who="Cualquier persona con una cuenta que abra tu perfil."
                />
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-semibold mt-6 mb-2">Cómo se sirven tus fotos</h3>
          <p className="mb-4">
            Las fotos que subes, tanto las de progreso como las de comida, se guardan como archivos con un
            nombre largo y difícil de adivinar, y se sirven por esa dirección sin comprobar quién la abre.
            La aplicación solo las lista para tu cuenta y nadie puede llegar a ellas navegando, pero si esa
            dirección exacta se filtrara, quien la tuviera podría abrirla. No subas nada que no publicarías
            si esa dirección se filtrara.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Rutas GPS de carreras: limitación conocida</h3>
          <p className="mb-4">
            Preferimos decírtelo a que lo descubras por tu cuenta. Cuando corres una <strong>carrera</strong>,
            el recorrido que registra tu móvil se guarda junto al resto de tu participación, y las
            participaciones son legibles por cualquier cuenta con la sesión iniciada. Ninguna pantalla de la
            aplicación dibuja el recorrido de otra persona, pero el servidor tampoco impide leerlo. Como un
            recorrido suele empezar y terminar en tu casa, lo consideramos un fallo y estamos trabajando en
            cerrarlo. Mientras tanto, si no quieres que quede legible, no participes en carreras desde tu
            domicilio.
          </p>
          <p className="mb-4">
            Esto <strong>ya no ocurre</strong> con las rutas de tus sesiones de cardio normales: desde el 31
            de julio de 2026 se guardan en un sitio aparte al que solo llega tu cuenta. Las rutas que
            grabaste antes de esa fecha también se movieron allí.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">4. Proveedores con los que compartimos datos</h2>
          <p className="mb-4">
            No vendemos tu información personal ni la cedemos con fines publicitarios. Para funcionar, la
            aplicación se apoya en estos servicios:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li><strong>Google (inicio de sesión):</strong> utilizamos Google OAuth. Google puede recopilar datos según su propia política de privacidad.</li>
            <li><strong>Proveedores de inteligencia artificial (Anthropic, OpenAI y Google):</strong> reciben las fotos de comida que envías a analizar y, para los resúmenes semanales, un resumen en texto de tus entrenos, cardio, comidas, agua, sueño, peso y datos de Health Connect. <strong>No</strong> reciben tus fotos de progreso, tus medidas corporales ni tus condiciones médicas y lesiones. El proveedor concreto depende de la disponibilidad del servicio en cada momento.</li>
            <li><strong>Langfuse (observabilidad de IA):</strong> cuando está activado, conserva una copia de las peticiones enviadas a los proveedores anteriores y de sus respuestas.</li>
            <li><strong>Sentry (diagnóstico de errores):</strong> en la web se envían tu nombre y tu correo junto al error, y se graba una repetición de la sesión con todo el texto enmascarado y las imágenes bloqueadas. En la aplicación de Android no se envían datos personales.</li>
            <li><strong>OpenPanel (analítica de uso):</strong> está alojado en nuestra propia infraestructura y no en un servicio de terceros. Registra tu identificador, tu nombre, tu correo y los eventos de uso de la aplicación. En la web también graba una repetición de la sesión (clics, desplazamiento y navegación) con todo el texto y los campos de formulario enmascarados; solo se guarda el texto legible en las páginas públicas de presentación, blog y descarga, donde no aparecen datos personales.</li>
            <li><strong>Servicios de notificaciones (Expo, Firebase Cloud Messaging y el servicio push de tu navegador):</strong> reciben el identificador de notificaciones de tu dispositivo y el texto de cada aviso.</li>
            <li><strong>CARTO (mapas):</strong> sirve las imágenes del mapa sobre el que se dibuja tu ruta de cardio, por lo que conoce la zona que se está mostrando.</li>
            <li><strong>Requerimientos legales:</strong> si la ley lo exige.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">5. Almacenamiento y seguridad</h2>
          <p className="mb-4">
            Tus datos se almacenan en nuestros propios servidores. Implementamos medidas de seguridad
            razonables para proteger tu información, incluyendo cifrado en tránsito (HTTPS) y control de
            acceso por cuenta. Las limitaciones concretas que conocemos están descritas en la sección 3 en
            lugar de resumidas en una promesa genérica.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">6. Conservación y borrado</h2>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>No borramos nada automáticamente. Mientras tu cuenta exista, se conserva todo lo que registres.</li>
            <li>Todavía no existe un botón para borrar tu cuenta, ni en la web ni en Android. Escríbenos a la dirección de la sección 12 y la eliminamos.</li>
            <li>Al eliminar la cuenta se borran con ella tus fotos de progreso, medidas, peso, sueño, comidas y sus fotos, condiciones médicas y lesiones, datos de Health Connect, resúmenes generados por IA, entrenos, series, ajustes, marcas personales y estadísticas. Desde el 31 de julio de 2026 también tus sesiones de cardio con su ruta GPS y tus participaciones en carreras, que antes había que borrar aparte.</li>
            <li>Cuatro categorías siguen sin borrarse solas por un fallo técnico que estamos corrigiendo: tus sesiones de circuito, las carreras que hayas creado, tus invitaciones a otras personas y las denuncias en las que aparezcas. Las eliminamos a mano en el mismo momento en que nos pides la baja.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">7. Exportar tus datos</h2>
          <p className="mb-4">
            Desde la web puedes descargar dos ficheros CSV: uno con tus entrenos y series, y otro con tu
            historial de peso. Hoy no hay exportación desde la aplicación de Android, ni de nutrición,
            sueño, medidas o fotos. Si quieres una copia completa de tus datos, pídenosla y te la
            enviamos.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">8. Tus derechos</h2>
          <p className="mb-2">Tienes derecho a:</p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Acceder a tus datos personales desde tu perfil y descargarlos como se explica en la sección 7.</li>
            <li>Modificar o corregir tu información.</li>
            <li>Solicitar la eliminación de tu cuenta y de todos tus datos como se explica en la sección 6.</li>
            <li>Revocar el acceso de Google OAuth en cualquier momento desde la configuración de tu cuenta de Google.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">9. Cookies y almacenamiento local</h2>
          <p className="mb-4">
            Utilizamos almacenamiento local del navegador (localStorage) para mantener tu sesión iniciada
            y guardar preferencias. No utilizamos cookies de seguimiento de terceros: la analítica de uso
            corre en nuestra propia infraestructura.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">10. Menores de edad</h2>
          <p className="mb-4">
            Esta aplicación no está dirigida a menores de 13 años. No recopilamos intencionalmente
            información de menores de 13 años.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">11. Cambios a esta política</h2>
          <p className="mb-4">
            Podemos actualizar esta política periódicamente. Te notificaremos de cambios significativos
            a través de la aplicación.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">12. Contacto</h2>
          <p className="mb-4">
            Si tienes preguntas sobre esta política, o quieres pedir la baja o una copia de tus datos,
            escríbenos a:{' '}
            <a href="mailto:contacto@calisteniaapp.com" className="text-primary hover:underline">
              contacto@calisteniaapp.com
            </a>
          </p>
        </section>

        {/* Terms of Service */}
        <section id="terms">
          <h1 className="text-3xl font-bold mb-2">Condiciones de Servicio</h1>
          <p className="text-sm text-muted-foreground mb-6">Última actualización: {UPDATED}</p>

          <p className="mb-4">
            Al usar Calistenia App, aceptas estas condiciones de servicio. Si no estás de acuerdo,
            por favor no utilices la aplicación.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">1. Descripción del servicio</h2>
          <p className="mb-4">
            Calistenia App es una aplicación de seguimiento de entrenamiento y nutrición que permite
            a los usuarios registrar ejercicios, crear programas de entrenamiento, hacer seguimiento
            de su progreso y participar en funciones sociales como desafíos y rankings.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">2. Cuentas de usuario</h2>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Puedes registrarte con email/contraseña o mediante Google OAuth.</li>
            <li>Eres responsable de mantener la seguridad de tu cuenta.</li>
            <li>Debes proporcionar información veraz al registrarte.</li>
            <li>Una cuenta por persona.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">3. Uso aceptable</h2>
          <p className="mb-2">Al usar la aplicación, te comprometes a:</p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>No usar la aplicación para actividades ilegales.</li>
            <li>No intentar acceder a cuentas de otros usuarios.</li>
            <li>No interferir con el funcionamiento de la aplicación.</li>
            <li>No enviar contenido ofensivo, abusivo o inapropiado.</li>
            <li>No usar bots o scripts automatizados.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">4. Contenido del usuario</h2>
          <p className="mb-4">
            Conservas la propiedad de los datos que registras (entrenamientos, comidas, etc.).
            Nos otorgas una licencia limitada para almacenar y mostrar este contenido dentro
            de la aplicación.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">5. Disclaimer médico</h2>
          <p className="mb-4">
            Calistenia App no es un servicio médico ni un sustituto del consejo médico profesional.
            Las condiciones médicas y lesiones que declares se usan únicamente para ajustar qué
            programas se te recomiendan; no son una valoración clínica y no las revisa ningún
            profesional sanitario. Los resúmenes generados por inteligencia artificial son
            orientativos y pueden equivocarse. Consulta con un profesional de salud antes de comenzar
            cualquier programa de ejercicios. No nos hacemos responsables de lesiones derivadas del uso
            de la aplicación.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">6. Disponibilidad del servicio</h2>
          <p className="mb-4">
            Nos esforzamos por mantener la aplicación disponible, pero no garantizamos un servicio
            ininterrumpido. Podemos modificar, suspender o discontinuar el servicio en cualquier momento.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">7. Limitación de responsabilidad</h2>
          <p className="mb-4">
            La aplicación se proporciona "tal cual" sin garantías de ningún tipo. No somos responsables
            de daños indirectos, incidentales o consecuentes derivados del uso de la aplicación.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">8. Terminación</h2>
          <p className="mb-4">
            Podemos suspender o cancelar tu cuenta si violas estas condiciones. Puedes darte de baja
            cuando quieras: todavía no hay un botón para hacerlo dentro de la aplicación, así que
            escríbenos y eliminamos tu cuenta y tus datos como se describe en la sección 6 de la
            política de privacidad.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">9. Modificaciones</h2>
          <p className="mb-4">
            Podemos modificar estas condiciones en cualquier momento. El uso continuado de la
            aplicación tras los cambios constituye tu aceptación de las nuevas condiciones.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">10. Contacto</h2>
          <p className="mb-4">
            Para consultas sobre estas condiciones:{' '}
            <a href="mailto:contacto@calisteniaapp.com" className="text-primary hover:underline">
              contacto@calisteniaapp.com
            </a>
          </p>
        </section>

        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Calistenia App. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  )
}
