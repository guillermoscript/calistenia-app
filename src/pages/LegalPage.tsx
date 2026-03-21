import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

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
          <h1 className="text-3xl font-bold mb-2">Politica de Privacidad</h1>
          <p className="text-sm text-muted-foreground mb-6">Ultima actualizacion: 21 de marzo de 2026</p>

          <p className="mb-4">
            Calistenia App ("nosotros", "nuestro" o "la aplicacion") se compromete a proteger tu privacidad.
            Esta politica describe como recopilamos, usamos y protegemos tu informacion personal cuando
            utilizas nuestra aplicacion.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">1. Informacion que recopilamos</h2>
          <p className="mb-2">Recopilamos la siguiente informacion:</p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li><strong>Datos de cuenta:</strong> nombre, direccion de correo electronico y foto de perfil cuando te registras o inicias sesion con Google.</li>
            <li><strong>Datos de entrenamiento:</strong> ejercicios, series, repeticiones, pesos, sesiones de cardio y progreso que registras en la app.</li>
            <li><strong>Datos de nutricion:</strong> registros de comidas y objetivos nutricionales.</li>
            <li><strong>Datos del dispositivo:</strong> tipo de navegador, sistema operativo e idioma, utilizados para mejorar la experiencia.</li>
            <li><strong>Datos de ubicacion:</strong> solo cuando usas la funcion de cardio con GPS, y unicamente mientras la sesion esta activa.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">2. Como usamos tu informacion</h2>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Proporcionar, mantener y mejorar los servicios de la aplicacion.</li>
            <li>Personalizar tu experiencia de entrenamiento y nutricion.</li>
            <li>Permitir funciones sociales como amigos, ranking y desafios.</li>
            <li>Enviar recordatorios y notificaciones que hayas configurado.</li>
            <li>Analizar el uso para mejorar la aplicacion.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">3. Compartir informacion</h2>
          <p className="mb-4">
            No vendemos ni compartimos tu informacion personal con terceros, excepto:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li><strong>Autenticacion con Google:</strong> utilizamos Google OAuth para el inicio de sesion. Google puede recopilar datos segun su propia politica de privacidad.</li>
            <li><strong>Funciones sociales:</strong> tu nombre de usuario, foto y estadisticas pueden ser visibles para otros usuarios si participas en funciones sociales (amigos, ranking, desafios).</li>
            <li><strong>Requerimientos legales:</strong> si la ley lo exige.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">4. Almacenamiento y seguridad</h2>
          <p className="mb-4">
            Tus datos se almacenan de forma segura en nuestros servidores. Implementamos medidas de
            seguridad razonables para proteger tu informacion, incluyendo cifrado en transito (HTTPS)
            y control de acceso.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">5. Tus derechos</h2>
          <p className="mb-2">Tienes derecho a:</p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Acceder a tus datos personales desde tu perfil.</li>
            <li>Modificar o corregir tu informacion.</li>
            <li>Solicitar la eliminacion de tu cuenta y todos tus datos.</li>
            <li>Revocar el acceso de Google OAuth en cualquier momento desde la configuracion de tu cuenta de Google.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">6. Cookies y almacenamiento local</h2>
          <p className="mb-4">
            Utilizamos almacenamiento local del navegador (localStorage) para mantener tu sesion iniciada
            y guardar preferencias. No utilizamos cookies de seguimiento de terceros.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">7. Menores de edad</h2>
          <p className="mb-4">
            Esta aplicacion no esta dirigida a menores de 13 anos. No recopilamos intencionalmente
            informacion de menores de 13 anos.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">8. Cambios a esta politica</h2>
          <p className="mb-4">
            Podemos actualizar esta politica periodicamente. Te notificaremos de cambios significativos
            a traves de la aplicacion.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">9. Contacto</h2>
          <p className="mb-4">
            Si tienes preguntas sobre esta politica, contactanos en:{' '}
            <a href="mailto:contacto@calisteniaapp.com" className="text-primary hover:underline">
              contacto@calisteniaapp.com
            </a>
          </p>
        </section>

        {/* Terms of Service */}
        <section id="terms">
          <h1 className="text-3xl font-bold mb-2">Condiciones de Servicio</h1>
          <p className="text-sm text-muted-foreground mb-6">Ultima actualizacion: 21 de marzo de 2026</p>

          <p className="mb-4">
            Al usar Calistenia App, aceptas estas condiciones de servicio. Si no estas de acuerdo,
            por favor no utilices la aplicacion.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">1. Descripcion del servicio</h2>
          <p className="mb-4">
            Calistenia App es una aplicacion de seguimiento de entrenamiento y nutricion que permite
            a los usuarios registrar ejercicios, crear programas de entrenamiento, hacer seguimiento
            de su progreso y participar en funciones sociales como desafios y rankings.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">2. Cuentas de usuario</h2>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Puedes registrarte con email/contrasena o mediante Google OAuth.</li>
            <li>Eres responsable de mantener la seguridad de tu cuenta.</li>
            <li>Debes proporcionar informacion veraz al registrarte.</li>
            <li>Una cuenta por persona.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">3. Uso aceptable</h2>
          <p className="mb-2">Al usar la aplicacion, te comprometes a:</p>
          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>No usar la aplicacion para actividades ilegales.</li>
            <li>No intentar acceder a cuentas de otros usuarios.</li>
            <li>No interferir con el funcionamiento de la aplicacion.</li>
            <li>No enviar contenido ofensivo, abusivo o inapropiado.</li>
            <li>No usar bots o scripts automatizados.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">4. Contenido del usuario</h2>
          <p className="mb-4">
            Conservas la propiedad de los datos que registras (entrenamientos, comidas, etc.).
            Nos otorgas una licencia limitada para almacenar y mostrar este contenido dentro
            de la aplicacion.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">5. Disclaimer medico</h2>
          <p className="mb-4">
            Calistenia App no es un servicio medico ni un sustituto del consejo medico profesional.
            Consulta con un profesional de salud antes de comenzar cualquier programa de ejercicios.
            No nos hacemos responsables de lesiones derivadas del uso de la aplicacion.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">6. Disponibilidad del servicio</h2>
          <p className="mb-4">
            Nos esforzamos por mantener la aplicacion disponible, pero no garantizamos un servicio
            ininterrumpido. Podemos modificar, suspender o discontinuar el servicio en cualquier momento.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">7. Limitacion de responsabilidad</h2>
          <p className="mb-4">
            La aplicacion se proporciona "tal cual" sin garantias de ningun tipo. No somos responsables
            de danos indirectos, incidentales o consecuentes derivados del uso de la aplicacion.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">8. Terminacion</h2>
          <p className="mb-4">
            Podemos suspender o cancelar tu cuenta si violas estas condiciones. Puedes eliminar tu
            cuenta en cualquier momento desde la configuracion de tu perfil.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">9. Modificaciones</h2>
          <p className="mb-4">
            Podemos modificar estas condiciones en cualquier momento. El uso continuado de la
            aplicacion tras los cambios constituye tu aceptacion de las nuevas condiciones.
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
