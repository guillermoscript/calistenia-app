import { Card, CardContent, Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@calistenia/web'

// Los botones solos no tienen carrusel al que apuntar: se muestran en su Carousel.
export const EnUnCarrusel = () => (
  <Carousel className="w-80">
    <CarouselContent>
      {['Semana 1', 'Semana 2', 'Semana 3'].map((s) => (
        <CarouselItem key={s} className="basis-2/3">
          <Card><CardContent className="grid h-32 place-items-center font-bebas font-normal text-2xl tracking-wide">{s}</CardContent></Card>
        </CarouselItem>
      ))}
    </CarouselContent>
    <CarouselPrevious />
    <CarouselNext />
  </Carousel>
)
