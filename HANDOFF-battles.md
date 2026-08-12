# Traspaso — issues pendientes de batallas de circuito

Copia el bloque que corresponda como primer mensaje de una sesión nueva.

---

## 1. #402 — Reutilizar la UI de entreno en las batallas (el grande)

```
/work-issue #402 +vercel-react-native-skills +vercel-react-best-practices

Contexto que no está en el issue y necesitas antes de tocar nada:

- NO empieces hasta que la cadena #385→#406 esté mergeada en main. Este trabajo
  toca ficheros que esos PRs modifican y rebasar 11 PRs apilados no compensa.
  Comprueba con: gh pr list --state open --search "battle"
- El issue ya trae el diseño acordado y las reglas de rendimiento concretas que
  hay que aplicar. Síguelo; no lo redefinas.
- Lee apps/mobile/CLAUDE.md antes de escribir código. Dos reglas mandan sobre
  cualquier idea que se te ocurra: SessionView es dueño de stepIdx/phase y los
  EMPUJA al context, nunca al revés; y packages/core no puede importar nada de
  React Native ni del DOM.
- El error que este issue existe para evitar: NO metas las batallas dentro de
  SessionView. La razón está argumentada en el cuerpo del issue.
- Parte del trabajo ya está hecho en el PR #405: BattleStandingsList quedó
  extraído y battleSpanMs/formatBattleElapsed ya viven en core. Míralo primero
  como referencia del tamaño de pieza que se espera.
- Tests: packages/core se testea con ../../apps/mobile/node_modules/.bin/vitest
  run. apps/mobile usa vitest en entorno node y NO puede renderizar componentes;
  la única estrategia válida es extraer funciones puras y testearlas.
- Criterio de aceptación duro: si un componente de presentación acepta un Step o
  un BattleSnapshot en sus props, la separación no ocurrió. Revísalo tú mismo
  antes de abrir el PR.
```

---

## 2. #357 — Resultados, revancha, compartir y analytics

```
/work-issue #357

Contexto que no está en el issue:

- Espera a que la cadena #385→#406 esté en main.
- OJO, esto ya NO está pendiente y el issue no lo refleja: el historial de
  batallas y la comparación cara a cara se entregaron en el PR #401. Las
  clasificaciones finales se sellan en `battles.final_standings` al cerrarse la
  batalla, por CUATRO caminos: terminar, salir el último, cancelar y el cron de
  caducidad. Empieza revisando lo que ya existe y recorta el alcance del issue en
  consecuencia; dilo explícitamente en el PR.
- La razón de sellar en vez de reconstruir: la regla de lectura de
  battle_participants limita a cada quien a su propia fila, así que un invitado
  no puede reconstruir la clasificación — vería un ranking de uno.
- Las batallas cerradas antes de esa migración no tienen clasificación y salen
  como "sin resultado". No las rellenes: contarlas como derrotas inventaría
  partidas que el usuario nunca jugó.
- El issue trae ya el análisis de colisión de analytics; ojo, ya está resuelto:
  las carreras GPS emiten race_* y battle_* es solo de batallas.
- Los pb_hooks NO se despliegan solos: si tocas alguno, apunta en el PR que
  producción necesita reinicio de PocketBase.
```

---

## 3. #386 — Cualquier autenticado puede leer las sesiones de otros

```
/work-issue #386

Contexto:

- Es independiente de las batallas; se puede hacer en paralelo y sobre main.
- Es de seguridad y toca reglas de API de PocketBase, así que va con migración.
- REGLA CRÍTICA del repo: al cambiar un campo de PocketBase hay que preservar
  field.id o se pierden los datos. Ver la memoria feedback_migration_safety.
- Antes de implementar, valida la premisa del issue contra el servidor real: en
  #354 la premisa del issue resultó ser FALSA y se implementó de más. Comprueba
  con una consulta autenticada como un usuario cualquiera qué se ve de verdad, y
  escribe el hallazgo en el issue antes de escribir código.
```

---

## Reglas que aplican a los tres

- Revalida el estado del issue justo antes de implementar Y justo antes de
  pushear: `gh issue view <N> --json state`. En esta sesión pasó que un issue se
  implementó entero en una rama mientras ya estaba mergeado en otra.
- Trabaja en un worktree aislado.
- Idioma: comentarios y UI en español; commits, PRs y comentarios de GitHub en
  inglés profesional.
- Nunca uses `git stash` a secas: la pila se comparte entre worktrees.

## Antes de nada: desplegar lo que ya está hecho

Tras mergear la cadena #385 → #391 → #392 → #393 → #394 → #395 → #399 → #400 →
#401 → #405 → #406, en ese orden:

1. **Reiniciar PocketBase en producción.** Los `pb_hooks` no se despliegan solos y
   sin reinicio TODAS las rutas de batallas dan 404. La migración de #401 sí se
   aplica sola al pushear.
2. **Re-apuntar los informes de OpenPanel** de `battle_*` a `race_*`: cualquier
   informe construido antes del 2026-08-11 sobre `battle_*` estaba midiendo
   carreras GPS, no batallas.
3. **Subir `versionCode`** en `apps/mobile/app.json` antes de compilar para el
   móvil, o Android instala en silencio el código viejo.
