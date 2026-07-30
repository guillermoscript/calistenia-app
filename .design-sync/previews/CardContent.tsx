import { Card, CardContent, CardHeader, CardTitle } from '@calistenia/web'

export const EnUnaTarjeta = () => (
  <Card className="w-80">
    <CardHeader><CardTitle>Notas de la sesión</CardTitle></CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      Buenas sensaciones en el tirón. El hombro derecho molesta en la última serie.
    </CardContent>
  </Card>
)
