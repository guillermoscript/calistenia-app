# Integration tests de `pb_hooks/` (issue #144)

Tests de integración contra un **PocketBase real y efímero** con las
migraciones (`pb_migrations/`) y hooks (`pb_hooks/`) del repo. Cubren los side
effects que antes fallaban en silencio en producción: notificaciones sociales,
fan-out a seguidores, puntos de referral, guards de bloqueo, rachas
server-side, crons de reminders/insights y rutas custom.

## Correr

```bash
pnpm test:pb-hooks                      # usa ./pocketbase de la raíz del repo
PB_BINARY=/ruta/a/pocketbase pnpm test:pb-hooks   # binario explícito (CI, worktrees)
pnpm test:pb-hooks crons                # solo los archivos que matcheen "crons"
```

Sin dependencias nuevas: usa el test runner nativo de Node (`node --test`) y
`fetch`. En CI corre en el job `e2e-smoke` con el binario cacheado en `/tmp/pb`.

## Cómo funciona (`run.mjs`)

1. Levanta un **mock del AI API** (`helpers/push-mock.mjs`) y expone lo
   capturado en `GET /_captured` — los hooks hacen `$http.send` ahí vía
   `AI_API_URL`, así los tests assertan qué push se habría enviado.
2. Levanta PocketBase en un puerto libre con `pb_data` de scratch en un tmpdir
   (nunca toca datos reales) y `AI_API_URL`/`INTERNAL_API_KEY` apuntando al mock.
3. Crea un superuser y corre cada `*.test.mjs` secuencialmente (comparten la
   instancia; cada test crea usuarios propios).

`helpers/client.mjs` trae el cliente REST: `createUser`, `createAs` (create
autenticado como un usuario → pasa por API rules y `requestInfo()` reales),
`create`/`update`/`remove` como superuser, `expectNotifications`, `waitForPush`,
`triggerCron` (dispara crons vía `POST /api/crons/{id}`), etc.

## Gotchas aprendidos (¡leer antes de escribir hooks nuevos!)

- Los callbacks de `cronAdd`/handlers corren en **JSVM aislado**: no ven
  funciones top-level del archivo. Helpers → `utils/*.js` + `require` dentro
  del callback. Un ReferenceError en un cron muere **en silencio** (sin log).
- `Record.getId()` no existe en el JSVM → usar `getString("id")`.
- `record.get()` sobre un campo `json` devuelve JSONRaw (array de **bytes** en
  goja, `Array.isArray` da true) → usar `getString()` + `JSON.parse`.
- `findRecordsByFilter` con sort sobre un campo inexistente (p.ej. `-created`
  en colecciones sin autodate) lanza GoError — y si está en try/catch, falla
  en silencio.

Los cuatro se descubrieron con esta suite: eran bugs reales en producción
(challenge_complete, weekly_cross_insight y ambos crons de push_reminders
no funcionaron nunca).
