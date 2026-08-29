/**
 * tools/social.ts — retos, batallas y carreras para el MCP (#667).
 *
 * La épica #345 llevaba meses en producción sin que el servidor la viera: no
 * había una sola referencia a `challenges`, `battles` ni `races` en
 * `mcp-server/src`, así que «¿cómo voy en el reto?», «¿quién va ganando la
 * batalla?» y «¿cuánto corrí en la última carrera?» —las preguntas que uno le
 * hace a un asistente justamente para no abrir la app— no tenían respuesta.
 *
 * SOLO LECTURA, a propósito. Apuntarse a un reto, retar a alguien o unirse a
 * una carrera son actos sociales que mandan notificaciones a terceros; el valor
 * está en consultar y el riesgo, entero, en escribir.
 *
 * DÓNDE ESTÁ CADA COSA:
 *  - la puntuación de un reto, en `api/challenge-score-server.ts` (usa las
 *    funciones puras de core, no una copia);
 *  - el marcador de una batalla, en `api/battle-server.ts` (endpoint
 *    `/snapshot`, nunca la colección);
 *  - las lecturas, en `api/repos/social.ts`.
 *
 * REGLA QUE ATRAVIESA LAS CUATRO TOOLS: una lista vacía se dice como «no hay
 * ninguno», nunca como un cero de dominio, porque una regla de API que no casa
 * devuelve 0 filas EN SILENCIO (#422).
 */

import type { AppServer } from "../mcpuse/auth-bridge.js";
import { z } from "zod";
import { getAuthManager } from "../mcpuse/auth-bridge.js";
import { errorResult, ResponseFormat, today, toDateStr } from "../utils.js";
import {
  buildChallengeLeaderboard,
  metricUnit,
  type ChallengeLeaderboard,
  type ScorableChallenge,
} from "../api/challenge-score-server.js";
import { fetchBattleSnapshot, toClosedBattleView, type BattleView } from "../api/battle-server.js";
import {
  countChallengeParticipants,
  getChallenge,
  listMyBattleHistory,
  listMyChallengeParticipations,
  listMyOpenBattles,
  listMyRaceParticipations,
  listRaceParticipants,
  type RecordModel,
} from "../api/repos/index.js";
import { sortRaceParticipants } from "@calistenia/core/lib/race-sort";

/**
 * Cuántos retos de la lista se clasifican de verdad.
 *
 * Clasificar cuesta una consulta por participante y reto —el mismo N+1 que la
 * app acepta en la pantalla de detalle, donde solo hay un reto a la vista—. En
 * una lista se dispara, así que se ordenan los retos por urgencia (el que antes
 * acaba primero) y solo se puntúan los primeros; para el resto la tool remite a
 * `cal_get_challenge`, que sí clasifica cualquiera. `ranked: false` lo dice en
 * la salida para que no se lea como un empate a cero.
 */
const MAX_RANKED_CHALLENGES = 4;

/** Cuántas filas del ranking se imprimen en markdown antes de resumir. */
const TOP_ROWS = 10;

/** Días que quedan para una fecha `YYYY-MM-DD`, en la zona del usuario. */
function daysUntil(dateStr: string, todayStr: string): number {
  const a = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`).getTime();
  const b = new Date(`${todayStr}T12:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

/** Un reto crudo de PocketBase → la forma que usan las tools. */
function toChallenge(row: RecordModel, todayStr: string) {
  // El cierre real lo hace el cron `challenges_expiry` (#515), que puede tardar
  // hasta ~36 h porque espera a que el día acabe en todas las zonas horarias.
  // La app reclasifica en local para no enseñar como activo un reto terminado;
  // sin esto el servidor diría lo contrario que la pantalla.
  const endsAt = String(row.ends_at ?? "");
  const rawStatus = String(row.status ?? "");
  const status = rawStatus === "active" && endsAt.slice(0, 10) < todayStr ? "ended" : rawStatus;

  return {
    id: row.id,
    title: String(row.title ?? ""),
    metric: String(row.metric ?? ""),
    custom_metric: (row.custom_metric as string) || null,
    exercise_slug: (row.exercise_slug as string) || "",
    description: (row.description as string) || "",
    goal: Number(row.goal) || 0,
    starts_at: String(row.starts_at ?? ""),
    ends_at: endsAt,
    status,
    unit: metricUnit(String(row.metric ?? "")),
    /** 'express' = reto de referidos: `daily_target` reps/día durante N días. */
    type: (row.type as string) || "standard",
    daily_target: Number(row.daily_target) || 0,
    duration_days: Number(row.duration_days) || 0,
  };
}

type ChallengeOut = ReturnType<typeof toChallenge>;

/** `12 reps`, `4.3 km`, `7` — el número con su unidad cuando la hay. */
function withUnit(value: number, unit: string): string {
  return unit ? `${value} ${unit}` : String(value);
}

function leaderboardLines(board: ChallengeLeaderboard, unit: string): string[] {
  if (!board.scored) {
    return [
      `_Métrica manual: este reto no se puntúa solo, así que no hay clasificación que calcular._`,
    ];
  }
  if (board.entries.length === 0) {
    return ["_Sin participantes visibles._"];
  }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = board.entries.slice(0, TOP_ROWS).map((e) => {
    const badge = medals[e.rank - 1] ?? `${e.rank}.`;
    const me = e.is_current_user ? " ← tú" : "";
    return `${badge} **${e.display_name}** — ${withUnit(e.value, unit)}${me}`;
  });
  if (board.entries.length > TOP_ROWS) {
    lines.push(`_…y ${board.entries.length - TOP_ROWS} participante(s) más._`);
  }
  if (board.hidden_private_count > 0) {
    lines.push(
      `_${board.hidden_private_count} participante(s) con cuenta privada no compiten en el ranking público._`,
    );
  }
  return lines;
}

export function registerSocialTools(server: AppServer, pbUrl: string) {
  // ──────────────────────────────────────────────────────────────
  // LIST CHALLENGES
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_list_challenges",
      title: "List Challenges",
      description:
        "List the challenges the user takes part in, with their standing. Active ones first (soonest deadline first). " +
        "Ranking is computed for the most urgent few; call cal_get_challenge for the full leaderboard of any single one.",
      schema: z
        .object({
          status: z
            .enum(["active", "past", "all"])
            .default("active")
            .describe("Which challenges to list. 'active' = running or not started yet."),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format: 'markdown' for human-readable or 'json' for structured data"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ status, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const todayStr = today(tz);

        const participations = await listMyChallengeParticipations(pb, userId);

        // Un reto puede traer varias filas de participación (invitación + alta):
        // el Map lo deja en uno solo, igual que `fetchChallenges`.
        const byId = new Map<string, ChallengeOut>();
        for (const p of participations) {
          const raw = (p.expand as { challenge?: RecordModel } | undefined)?.challenge;
          if (!raw || byId.has(raw.id)) continue;
          byId.set(raw.id, toChallenge(raw, todayStr));
        }

        const all = [...byId.values()];
        const active = all
          .filter((c) => c.status === "active")
          .sort((a, b) => a.ends_at.localeCompare(b.ends_at));
        const past = all
          .filter((c) => c.status !== "active")
          .sort((a, b) => b.ends_at.localeCompare(a.ends_at));
        const selected = status === "active" ? active : status === "past" ? past : [...active, ...past];

        if (selected.length === 0) {
          const label = status === "past" ? "past" : status === "all" ? "" : "active ";
          return {
            content: [
              {
                type: "text" as const,
                text: `The user is not taking part in any ${label}challenge right now.`,
              },
            ],
          };
        }

        const counts = await countChallengeParticipants(pb, selected.map((c) => c.id));
        const boards = await Promise.all(
          selected
            .slice(0, MAX_RANKED_CHALLENGES)
            .map((c) => buildChallengeLeaderboard(pb, c as ScorableChallenge, userId, tz)),
        );

        const challenges = selected.map((c, i) => {
          const board: ChallengeLeaderboard | undefined = boards[i];
          const leader = board?.entries[0] ?? null;
          return {
            ...c,
            days_left: c.status === "active" ? daysUntil(c.ends_at, todayStr) : 0,
            // Ausente ≠ 0: un conteo que falló no baja el reto a «nadie más».
            participant_count: counts[c.id] ?? null,
            ranked: !!board,
            my_rank: board?.my_rank ?? null,
            my_value: board?.my_value ?? null,
            leader: leader ? { display_name: leader.display_name, value: leader.value } : null,
            hidden_private_count: board?.hidden_private_count ?? null,
          };
        });

        const output = { count: challenges.length, status, challenges };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# Retos (${status})`, ""];
          for (const c of challenges) {
            const people = c.participant_count == null ? "?" : c.participant_count;
            const when =
              c.status === "active"
                ? c.days_left > 0
                  ? `quedan ${c.days_left} día(s)`
                  : "último día"
                : `terminó el ${c.ends_at.slice(0, 10)}`;
            lines.push(`## ${c.title}`);
            lines.push(`- ${c.metric}${c.exercise_slug ? ` (\`${c.exercise_slug}\`)` : ""} — ${when} — ${people} participante(s)`);
            if (c.goal > 0) lines.push(`- Objetivo: ${withUnit(c.goal, c.unit)}`);
            if (c.ranked) {
              lines.push(
                c.my_rank != null
                  ? `- **Tú vas ${c.my_rank}º** con ${withUnit(c.my_value ?? 0, c.unit)}${c.leader ? ` — lidera ${c.leader.display_name} con ${withUnit(c.leader.value, c.unit)}` : ""}`
                  : `- No apareces en la clasificación de este reto`,
              );
              if (c.hidden_private_count) {
                lines.push(`- _${c.hidden_private_count} participante(s) privados fuera del ranking._`);
              }
            } else {
              lines.push(`- Clasificación no calculada aquí — usa \`cal_get_challenge\` con id \`${c.id}\``);
            }
            lines.push("");
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text" as const, text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ──────────────────────────────────────────────────────────────
  // GET CHALLENGE
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_get_challenge",
      title: "Get Challenge Leaderboard",
      description:
        "Full detail and leaderboard of one challenge: every visible participant with their score, ranked the same way the app ranks them.",
      schema: z
        .object({
          challenge_id: z.string().describe("Challenge id (from cal_list_challenges)"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format: 'markdown' for human-readable or 'json' for structured data"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ challenge_id, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const todayStr = today(tz);

        const raw = await getChallenge(pb, challenge_id);
        if (!raw) {
          return errorResult(
            `Challenge ${challenge_id} not found, or the user cannot read it. It may have been deleted.`,
          );
        }

        const challenge = toChallenge(raw, todayStr);
        const board = await buildChallengeLeaderboard(pb, challenge as ScorableChallenge, userId, tz);

        const output = {
          challenge: {
            ...challenge,
            days_left: challenge.status === "active" ? daysUntil(challenge.ends_at, todayStr) : 0,
          },
          leaderboard: board.entries,
          participant_count: board.participant_count,
          hidden_private_count: board.hidden_private_count,
          scored: board.scored,
          my_rank: board.my_rank,
          my_value: board.my_value,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# ${challenge.title}`, ""];
          if (challenge.description) lines.push(`> ${challenge.description}`, "");
          lines.push(
            `- Métrica: **${challenge.custom_metric || challenge.metric}**${challenge.exercise_slug ? ` (\`${challenge.exercise_slug}\`)` : ""}`,
          );
          lines.push(`- Ventana: ${challenge.starts_at.slice(0, 10)} → ${challenge.ends_at.slice(0, 10)}`);
          if (challenge.goal > 0) lines.push(`- Objetivo: ${withUnit(challenge.goal, challenge.unit)}`);
          if (challenge.type === "express" && challenge.daily_target > 0) {
            lines.push(`- Express: ${challenge.daily_target} reps/día durante ${challenge.duration_days} días`);
          }
          lines.push(`- Participantes: ${board.participant_count}`, "", "## Clasificación", "");
          lines.push(...leaderboardLines(board, challenge.unit));
          text = lines.join("\n");
        }

        return { content: [{ type: "text" as const, text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ──────────────────────────────────────────────────────────────
  // LIST BATTLES
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_list_battles",
      title: "List Circuit Battles",
      description:
        "The user's circuit battles: the one still in play with its LIVE scoreboard, plus recent finished ones with the ranking as it stood when they closed.",
      schema: z
        .object({
          include_history: z
            .boolean()
            .default(true)
            .describe("Include recent closed battles (finished, cancelled or expired)"),
          limit: z.number().int().min(1).max(30).default(5).describe("How many closed battles to return"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format: 'markdown' for human-readable or 'json' for structured data"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ include_history, limit, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();

        const [open, closed] = await Promise.all([
          listMyOpenBattles(pb),
          include_history ? listMyBattleHistory(pb, limit) : Promise.resolve([] as RecordModel[]),
        ]);

        // La primera batalla abierta en la que el usuario TIENE asiento (o que
        // creó). El estado de la batalla por sí solo no basta: sigue `live`
        // mientras entrenan los demás, y una lobby ajena y rancia puede ordenar
        // por encima de la batalla que el usuario está jugando de verdad.
        const mine = open.find((b) => {
          if (b.creator === userId) return true;
          const seats = (b.expand as { battle_participants_via_battle?: RecordModel[] } | undefined)
            ?.battle_participants_via_battle;
          return (seats ?? []).some((s) => s.user === userId && s.status !== "left");
        });

        const live: BattleView | null = mine
          ? // Si el snapshot no contesta se sirve lo que ya hay en la mano, con
            // `standings_source: "none"`: sin marcador, pero sin inventarlo.
            (await fetchBattleSnapshot(pb, mine.id, userId)) ?? {
              ...toClosedBattleView(mine, userId),
              standings: [],
              standings_source: "none" as const,
              my_rank: null,
            }
          : null;

        const history = closed.map((b) => toClosedBattleView(b, userId));
        const output = { live, history, history_count: history.length };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines: string[] = ["# Batallas", ""];
          if (live) {
            lines.push(`## En juego — ${live.status}`);
            lines.push(`- ${live.rounds} ronda(s), ${live.exercise_count} ejercicio(s)`);
            if (live.standings_source === "snapshot" && live.standings.length > 0) {
              for (const s of live.standings) {
                const me = s.is_current_user ? " ← tú" : "";
                lines.push(
                  `${s.rank}. **${s.display_name}** — ${s.completed_rounds} ronda(s), ${s.completed_reps} reps (${s.status})${me}`,
                );
              }
            } else {
              lines.push(
                "- _El marcador vivo no ha contestado; no se puede decir quién va ganando ahora mismo._",
              );
            }
            lines.push("");
          } else {
            lines.push("_No hay ninguna batalla en juego._", "");
          }

          if (include_history) {
            lines.push(`## Historial (${history.length})`, "");
            for (const b of history) {
              const when = b.finished_at ? toDateStr(b.finished_at, tz) : "—";
              if (b.standings_source === "none") {
                // Se cerró antes de #398: no hay ranking guardado. Decirlo así
                // y no «sin clasificación», que se lee como una derrota.
                lines.push(`- **${when}** — ${b.status}, sin resultado guardado`);
                continue;
              }
              const winner = b.standings[0];
              const mineRow = b.standings.find((s) => s.is_current_user);
              lines.push(
                `- **${when}** — ${b.status}${winner ? `, ganó ${winner.display_name}` : ""}${mineRow ? ` (tú, ${mineRow.rank}º)` : ""}`,
              );
            }
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text" as const, text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  // ──────────────────────────────────────────────────────────────
  // LIST RACES
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_list_races",
      title: "List GPS Races",
      description:
        "The GPS races the user has taken part in, newest first, with the final classification of each and the user's own distance, time and pace.",
      schema: z
        .object({
          limit: z.number().int().min(1).max(20).default(5).describe("How many races to return"),
          status: z
            .enum(["finished", "open", "all"])
            .default("all")
            .describe("'open' = waiting, counting down or running; 'finished' = already over"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format: 'markdown' for human-readable or 'json' for structured data"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, status, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();

        const participations = await listMyRaceParticipations(pb, userId);
        const races = participations
          .map((p) => (p.expand as { race?: RecordModel } | undefined)?.race)
          .filter((r): r is RecordModel => !!r);

        const OPEN = new Set(["waiting", "countdown", "active"]);
        const selected = races
          .filter((r) => {
            const s = String(r.status ?? "");
            if (status === "finished") return s === "finished";
            if (status === "open") return OPEN.has(s);
            return true;
          })
          .sort((a, b) => String(b.starts_at ?? "").localeCompare(String(a.starts_at ?? "")))
          .slice(0, limit);

        if (selected.length === 0) {
          return {
            content: [{ type: "text" as const, text: "The user has not taken part in any race matching that filter." }],
          };
        }

        const rosters = await Promise.all(selected.map((r) => listRaceParticipants(pb, r.id)));

        const items = selected.map((race, i) => {
          // El orden lo pone `sortRaceParticipants` de core y no una copia: en
          // una carrera de distancia gana quien llega antes, pero en una de
          // tiempo todos terminan a la vez (auto-finish del reloj) y `finished_at`
          // solo mide latencia de red, así que ahí gana la distancia recorrida.
          const roster = rosters[i].map((p) => ({
            id: p.id,
            race: String(p.race ?? ""),
            user: String(p.user ?? ""),
            display_name: String(p.display_name ?? "?"),
            status: String(p.status ?? "") as never,
            distance_km: Number(p.distance_km) || 0,
            duration_seconds: Number(p.duration_seconds) || 0,
            avg_pace: Number(p.avg_pace) || 0,
            last_lat: null,
            last_lng: null,
            last_update: null,
            finished_at: (p.finished_at as string) ?? null,
          }));

          const sorted = sortRaceParticipants(roster, {
            mode: String(race.mode ?? "distance") as never,
            target_distance_km: Number(race.target_distance_km) || 0,
          });
          const ranking = sorted.map((p, idx) => ({
            position: idx + 1,
            display_name: p.display_name,
            distance_km: p.distance_km,
            duration_seconds: p.duration_seconds,
            avg_pace: p.avg_pace,
            status: p.status,
            is_current_user: p.user === userId,
          }));
          const me = ranking.find((p) => p.is_current_user) ?? null;

          return {
            id: race.id,
            name: String(race.name ?? ""),
            mode: String(race.mode ?? ""),
            activity_type: String(race.activity_type ?? "running"),
            status: String(race.status ?? ""),
            target_distance_km: Number(race.target_distance_km) || 0,
            target_duration_seconds: Number(race.target_duration_seconds) || 0,
            starts_at: (race.starts_at as string) ?? "",
            finished_at: (race.finished_at as string) ?? null,
            participant_count: ranking.length,
            my_position: me?.position ?? null,
            my_distance_km: me?.distance_km ?? null,
            my_duration_seconds: me?.duration_seconds ?? null,
            my_status: me?.status ?? null,
            ranking,
          };
        });

        const output = { count: items.length, races: items };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = ["# Carreras", ""];
          for (const r of items) {
            const when = r.starts_at ? toDateStr(r.starts_at, tz) : "—";
            const target =
              r.mode === "time"
                ? `${Math.round(r.target_duration_seconds / 60)} min`
                : r.target_distance_km > 0
                  ? `${r.target_distance_km} km`
                  : "libre";
            lines.push(`## ${r.name || "Carrera"} — ${when}`);
            lines.push(`- ${r.activity_type}, modo ${r.mode} (${target}) — ${r.status} — ${r.participant_count} corredor(es)`);
            if (r.my_position != null) {
              lines.push(
                `- **Tú: ${r.my_position}º** — ${r.my_distance_km} km en ${formatDuration(r.my_duration_seconds ?? 0)} (${r.my_status})`,
              );
            }
            for (const p of r.ranking.slice(0, TOP_ROWS)) {
              const me = p.is_current_user ? " ← tú" : "";
              lines.push(
                `  ${p.position}. ${p.display_name} — ${p.distance_km} km, ${formatDuration(p.duration_seconds)}${p.status === "dnf" ? " (DNF)" : ""}${me}`,
              );
            }
            lines.push("");
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text" as const, text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

/** Segundos → `h:mm:ss` o `m:ss`. */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
