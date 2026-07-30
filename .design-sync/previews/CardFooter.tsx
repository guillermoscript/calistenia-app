import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle } from '@calistenia/web'

export const EnUnaTarjeta = () => (
  <Card className="w-80">
    <CardHeader><CardTitle>Empuje · Día 2</CardTitle></CardHeader>
    <CardContent className="text-sm text-muted-foreground">5 ejercicios · ~45 min</CardContent>
    <CardFooter className="gap-2">
      <Button size="sm">Empezar</Button>
      <Button size="sm" variant="outline">Ver detalle</Button>
    </CardFooter>
  </Card>
)
