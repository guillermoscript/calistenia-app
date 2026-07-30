---
category: Navigation
---

Botón de anterior. Opcional en móvil.

Parte de la familia `Carousel`. Se usa dentro de `<Carousel>`, no por separado.

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

