/**
 * Process lifecycle for the server — everything that is NOT registration:
 *
 *   - Recordatorios push (comidas / entrenamiento / pausa activa). Sustituye a
 *     los crons de pb_hooks/push_reminders.pb.js: la conversión a la zona
 *     horaria del usuario es imposible en el JSVM de PocketBase (goja no trae
 *     `Intl`), así que el tick vive aquí, donde Node sí tiene ICU completo.
 *     REQUIERE una sola instancia del API — varias réplicas duplicarían envíos.
 *   - Push de inactividad 24h/72h (#695): mismo motivo, mismo requisito de
 *     instancia única.
 *   - Graceful shutdown: stop both schedulers and flush OTel traces.
 *
 * Imported for its side effects from server.ts. Guarded with a global flag
 * because `mcp-use dev` can re-evaluate the entry module on reload and we
 * must never end up with two schedulers ticking.
 */
import { shutdownTracing } from "./instrumentation.js";
import { startReminderScheduler, stopReminderScheduler } from "./api/reminder-dispatcher.js";
import { startInactivityScheduler, stopInactivityScheduler } from "./api/inactivity-dispatcher.js";

const FLAG = "__calistenia_bootstrapped__" as const;
const g = globalThis as typeof globalThis & { [FLAG]?: boolean };

// `mcp-use build` / `mcp-use typecheck` evaluate the entry module (to collect
// tool refs and prime views) without ever serving it. A scheduler ticking
// inside the Docker build stage would try to reach PocketBase and log noise,
// so only arm it in processes that actually serve: `mcp-use start|dev` and
// standalone.ts.
const isServingProcess = !/\b(build|typecheck)\b/.test(process.argv.slice(2).join(" "));

if (!g[FLAG] && isServingProcess) {
  g[FLAG] = true;

  if (process.env.REMINDERS_SCHEDULER !== "off") {
    startReminderScheduler();
  }

  if (process.env.INACTIVITY_PUSH !== "off") {
    startInactivityScheduler();
  }

  const shutdown = async (signal: string) => {
    console.error(`\n[Shutdown] ${signal} — flushing traces…`);
    stopReminderScheduler();
    stopInactivityScheduler();
    await shutdownTracing();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
