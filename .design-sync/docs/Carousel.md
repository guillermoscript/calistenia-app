---
category: Navigation
---

Carrusel horizontal deslizable (embla). Para galerías de fotos de progreso o series de tarjetas en móvil. `CarouselPrevious`/`CarouselNext` son opcionales: en móvil el gesto basta.

## Composición

```jsx
<Carousel>
  <CarouselContent>
    {fotos.map((f) => (
      <CarouselItem key={f.id} className="basis-2/3">
        <img src={f.url} alt={f.fecha} className="rounded-lg object-cover" />
      </CarouselItem>
    ))}
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>
```

## Piezas

- `CarouselContent` — La pista deslizable que contiene los `CarouselItem`.
- `CarouselItem` — Una diapositiva. Controla cuántas se ven con `basis-*`.
- `CarouselPrevious` — Botón de anterior. Opcional en móvil.
- `CarouselNext` — Botón de siguiente. Opcional en móvil.

