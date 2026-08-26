# seeds/exercises/media — media estática de ejercicios

Aquí se sueltan las imágenes de demostración de cada ejercicio. **Soltar el
fichero es todo lo que hay que hacer**: el constructor del catálogo lo descubre
solo (#619). No hay que editar ningún JSON a mano.

## Cómo se deja media

```
seeds/exercises/media/<slug>/sequence.webp     # demo del movimiento (2-3 fases)
seeds/exercises/media/<slug>/muscles.webp      # mapa de músculos trabajados
seeds/exercises/media/<slug>/thumbnail.webp    # miniatura para listas y tarjetas
seeds/exercises/media/<slug>/video.webm        # opcional: clip en bucle
```

Y luego, una vez:

```sh
pnpm exercises:media
```

Eso reconstruye el catálogo (engancha lo que encuentre), copia todo a
`apps/web/public/exercise-media/` y te imprime qué falta todavía.

### El nombre del fichero es lo que manda

El nombre **sin extensión** decide el hueco: `sequence`, `muscles`, `thumbnail`
o `video`. Cualquier otro nombre se ignora a propósito, así que puedes dejar los
originales al lado sin que acaben en el bundle:

```
seeds/exercises/media/strict-pull-up/
  sequence.webp      ← entra al catálogo
  muscles.webp       ← entra al catálogo
  _sequence.psd      ← ignorado (empieza por "_")
  notas.txt          ← ignorado (nombre no reconocido)
```

Extensiones aceptadas:

| Hueco       | Extensiones                                |
|-------------|--------------------------------------------|
| `sequence`  | `.webp` `.avif` `.png` `.jpg` `.jpeg` `.gif` |
| `muscles`   | `.webp` `.avif` `.png` `.jpg` `.jpeg`      |
| `thumbnail` | `.webp` `.avif` `.png` `.jpg` `.jpeg`      |
| `video`     | `.webm` `.mp4`                             |

### Qué slug le toca a cada ejercicio

No lo adivines — pregúntaselo al informe:

```sh
pnpm exercises:media:status
```

Imprime, por orden de impacto, qué ejercicios de los 15 programas oficiales
siguen sin media y **la ruta exacta** donde dejarla. `--all` los lista todos,
`--role sequence` filtra por hueco, `--json` escupe la lista para tooling.

El slug sale del `seed_slug` del catálogo cuando existe, y si no se deriva del id
cambiando `_` por `-` (`australian_pullup` → `australian-pullup`). Si dos
ejercicios se pelearan por la misma carpeta, el build avisa y descarta al que no
tiene seed propio, en vez de dejar que uno pise al otro en silencio.

## Por dónde empezar

El issue #619 manda priorizar los ejercicios que usan los 15 programas oficiales
—137 ejercicios distintos, no los 1.578 del catálogo—. El informe ya los ordena
por número de apariciones, que es lo que decide el impacto real: `deep_breathing`
sale 72 veces en los programas y `dragon_flag` una.

## Licencias — lo que NO se puede usar

La media de ExerciseDB **no está licenciada** para redistribuir ni hotlinkear
(ver #117), pese a que 1.271 ejercicios llevan un `exercisedb_media_id`. Lo que
entra aquí tiene que ser grabación propia o llevar licencia compatible.

## Qué pasa cuando falta

Nada roto: la UI dice «Sin demo aún» en el hueco de la miniatura y en el visor,
y el enlace de búsqueda en YouTube sigue estando siempre. La jerarquía completa
del resolutor (`packages/core/lib/exerciseMedia.ts`) es:

```
(a) override del programa  → program_exercises.demo_images / demo_video
(b) media estática         → /exercise-media/<slug>/…        ← lo de esta carpeta
(c) vídeo curado           → URL directa en el catálogo
(d) búsqueda en YouTube    ← siempre disponible
```

## Subir también a PocketBase (opcional)

Para que el móvil no dependa del bundle web, `scripts/seed-exercises.mjs` puede
subir ficheros a `exercises_catalog.default_images` / `default_video`. Es un
camino aparte del de esta carpeta y hoy no lo usa nadie: hay 0 filas con media.
