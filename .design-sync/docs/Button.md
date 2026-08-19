---
category: Actions
---

Acción primaria del sistema. `variant="default"` es casi-negro sobre claro (y casi-blanco en oscuro), y es el botón por defecto de casi toda la interfaz; `outline` para acciones secundarias y `ghost` para barras densas. El lima tiene dos variantes y ninguna es el botón por defecto: `limeSolid` es el CTA de la acción principal de una pantalla —empezar la sesión, guardar el plan, unirse a la carrera— y `lime` (filete + tinte) es su versión secundaria, la misma que marca lo activo o interactuado. Las dos usan los tokens `--lime`/`--lime-foreground`, nunca una escala de Tailwind ni `hsl(var(--lime))` a pelo: solo el token se adapta al modo claro. Para lo destructivo, `destructive` es el botón sólido y `danger` su filete rojo, para acciones como bloquear o abandonar que no deben pesar como el CTA.

## Composición

```jsx
<Button>Empezar sesión</Button>
<Button variant="limeSolid">Empezar entreno</Button>
<Button variant="lime">Ver el plan</Button>
<Button variant="outline">Ver programa</Button>
<Button variant="ghost" size="icon-sm"><Plus /></Button>
<Button variant="destructive">Abandonar sesión</Button>
<Button variant="danger">Bloquear usuario</Button>
```

