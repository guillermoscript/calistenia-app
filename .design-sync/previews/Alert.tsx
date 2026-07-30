import { Alert, AlertDescription, AlertTitle } from '@calistenia/web'

export const Aviso = () => (
  <Alert className="w-96">
    <AlertTitle>Sesión sin terminar</AlertTitle>
    <AlertDescription>
      Tienes una sesión de ayer a medias. Puedes reanudarla o descartarla desde el histórico.
    </AlertDescription>
  </Alert>
)

export const Fallo = () => (
  <Alert variant="destructive" className="w-96">
    <AlertTitle>No se pudo sincronizar</AlertTitle>
    <AlertDescription>
      Revisa tu conexión. Los datos siguen guardados en el dispositivo y se subirán solos.
    </AlertDescription>
  </Alert>
)
