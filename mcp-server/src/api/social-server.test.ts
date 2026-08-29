/**
 * Lo que el servidor podría decir mal de retos, batallas y carreras (#667).
 *
 * Los casos que se afirman aquí son los POSITIVOS y los tres que convierten un
 * fallo de permisos en un dato creíble:
 *  - un participante privado NO baja a cero: sale del ranking y se cuenta;
 *  - un conteo que falla NO es «0 participantes»: no entra en el mapa;
 *  - una batalla cerrada sin `final_standings` NO es una clasificación vacía.
 */

import { describe, it, expect, vi } from "vitest";
import type { PB, RecordModel } from "./repos/pb.js";
import { countChallengeParticipants, listMyOpenBattles } from "./repos/social.js";
import { buildChallengeLeaderboard, challengeWindow, metricUnit } from "./challenge-score-server.js";
import { fetchBattleSnapshot, toClosedBattleView, type PBWithSend } from "./battle-server.js";

type Rows = Record<string, unknown>[];

const rec = (row: Record<string, unknown>): RecordModel =>
  ({ collectionId: "c", collectionName: "c", ...row }) as RecordModel;

/**
 * Stub de PocketBase. `data` mapea colección → filas; `fail` marca las que
 * deben responder como una colección que no existe o cuya regla rechaza.
 */
function stubPb(data: Record<string, Rows>, fail: string[] = []) {
  const calls: Record<string, Record<string, unknown>[]> = {};
  const pb = {
    filter: (expr: string, params?: Record<string, unknown>) => JSON.stringify({ expr, params }),
    collection: (name: string) => ({
      getFullList: vi.fn(async (opts?: Record<string, unknown>) => {
        (calls[name] ??= []).push(opts ?? {});
        if (fail.includes(name)) throw new Error("404");
        return data[name] ?? [];
      }),
      getList: vi.fn(async (_page: number, _per: number, opts?: Record<string, unknown>) => {
        (calls[name] ??= []).push(opts ?? {});
        if (fail.includes(name)) throw new Error("404");
        const items = data[name] ?? [];
        return { items, totalItems: items.length };
      }),
      getFirstListItem: vi.fn(async () => {
        if (fail.includes(name)) throw new Error("404");
        const row = (data[name] ?? [])[0];
        if (!row) throw new Error("404");
        return row;
      }),
    }),
  } as unknown as PB;
  return { pb, calls };
}

/** Reto de ejercicio de una semana, con dos participantes. */
const CHALLENGE = {
  id: "ch1",
  metric: "exercise",
  exercise_slug: "pullup",
  starts_at: "2026-08-01",
  ends_at: "2026-08-07",
};

function participants(rows: Array<Record<string, unknown>>): Rows {
  return rows;
}

describe("challengeWindow", () => {
  it("incluye el último día entero: el fin es la medianoche del día SIGUIENTE", () => {
    const { start, end } = challengeWindow(CHALLENGE, "UTC");
    expect(start).toBe("2026-08-01 00:00:00");
    expect(end).toBe("2026-08-08 00:00:00");
  });

  it("la ventana es la del espectador: en Madrid la medianoche local cae antes en UTC", () => {
    const { start } = challengeWindow(CHALLENGE, "Europe/Madrid");
    expect(start).toBe("2026-07-31 22:00:00");
  });
});

describe("buildChallengeLeaderboard", () => {
  it("puntúa la MEJOR serie del ejercicio y ordena de más a menos", async () => {
    const { pb } = stubPb({
      challenge_participants: participants([
        { id: "p1", user: "u1", created: "2026-08-01 10:00:00", expand: { user: { id: "u1", display_name: "Ana" } } },
        { id: "p2", user: "u2", created: "2026-08-01 11:00:00", expand: { user: { id: "u2", display_name: "Bea" } } },
      ]),
      public_sets_log: [
        // Las series son de los DOS usuarios; el stub no filtra, así que este
        // caso afirma el orden y el «mejor set», no el filtro (que es de PB).
        { id: "s1", reps: "8" },
        { id: "s2", reps: "8-12" },
      ],
    });

    const board = await buildChallengeLeaderboard(pb, CHALLENGE, "u1", "UTC");

    expect(board.scored).toBe(true);
    expect(board.entries).toHaveLength(2);
    expect(board.entries[0].value).toBe(12);
    expect(board.my_rank).toBe(1);
    expect(board.my_value).toBe(12);
  });

  it("un participante privado sale del ranking y se cuenta aparte, NO baja a cero", async () => {
    const { pb } = stubPb({
      challenge_participants: participants([
        { id: "p1", user: "u1", created: "2026-08-01 10:00:00", expand: { user: { id: "u1", display_name: "Ana" } } },
        {
          id: "p2",
          user: "u2",
          created: "2026-08-01 11:00:00",
          expand: { user: { id: "u2", display_name: "Bea", is_private: true } },
        },
      ]),
      public_sets_log: [{ id: "s1", reps: "10" }],
    });

    const board = await buildChallengeLeaderboard(pb, CHALLENGE, "u1", "UTC");

    expect(board.entries.map((e) => e.display_name)).toEqual(["Ana"]);
    expect(board.hidden_private_count).toBe(1);
    // El total sigue contando a todo el mundo: son participantes de verdad.
    expect(board.participant_count).toBe(2);
  });

  it("el usuario privado SÍ se ve a sí mismo", async () => {
    const { pb } = stubPb({
      challenge_participants: participants([
        {
          id: "p1",
          user: "u1",
          created: "2026-08-01 10:00:00",
          expand: { user: { id: "u1", display_name: "Ana", is_private: true } },
        },
      ]),
      public_sets_log: [{ id: "s1", reps: "10" }],
    });

    const board = await buildChallengeLeaderboard(pb, CHALLENGE, "u1", "UTC");

    expect(board.my_rank).toBe(1);
    expect(board.entries[0].is_private).toBe(true);
    expect(board.hidden_private_count).toBe(0);
  });

  it("el empate lo rompe quién se inscribió antes, no el azar del fetch", async () => {
    const { pb } = stubPb({
      challenge_participants: participants([
        { id: "p1", user: "tarde", created: "2026-08-02 10:00:00", expand: { user: { id: "tarde", display_name: "Tarde" } } },
        { id: "p2", user: "pronto", created: "2026-08-01 10:00:00", expand: { user: { id: "pronto", display_name: "Pronto" } } },
      ]),
      public_sets_log: [{ id: "s1", reps: "10" }],
    });

    const board = await buildChallengeLeaderboard(pb, CHALLENGE, "otro", "UTC");

    expect(board.entries.map((e) => e.display_name)).toEqual(["Pronto", "Tarde"]);
  });

  it("total_exercise SUMA las series en vez de quedarse con la mejor", async () => {
    const { pb } = stubPb({
      challenge_participants: participants([
        { id: "p1", user: "u1", created: "", expand: { user: { id: "u1", display_name: "Ana" } } },
      ]),
      public_sets_log: [
        { id: "s1", reps: "10" },
        { id: "s2", reps: "3x10" },
      ],
    });

    const board = await buildChallengeLeaderboard(
      pb,
      { ...CHALLENGE, metric: "total_exercise" },
      "u1",
      "UTC",
    );

    expect(board.my_value).toBe(40);
  });

  it("una métrica manual ('custom') no se puntúa y lo dice", async () => {
    const { pb } = stubPb({
      challenge_participants: participants([
        { id: "p1", user: "u1", created: "", expand: { user: { id: "u1", display_name: "Ana" } } },
      ]),
    });

    const board = await buildChallengeLeaderboard(pb, { ...CHALLENGE, metric: "custom" }, "u1", "UTC");

    expect(board.scored).toBe(false);
    expect(board.entries[0].value).toBe(0);
  });

  it("un PR heredado se lee de public_prs, nunca de settings", async () => {
    const { pb, calls } = stubPb({
      challenge_participants: participants([
        { id: "p1", user: "u1", created: "", expand: { user: { id: "u1", display_name: "Ana" } } },
      ]),
      public_prs: [{ id: "s1", user: "u1", pr_pullups: 17 }],
    });

    const board = await buildChallengeLeaderboard(pb, { ...CHALLENGE, metric: "most_pullups" }, "u1", "UTC");

    expect(board.my_value).toBe(17);
    expect(calls.settings).toBeUndefined();
  });

  it("si la lectura de scores falla el participante vale 0, pero sigue en el ranking", async () => {
    const { pb } = stubPb(
      {
        challenge_participants: participants([
          { id: "p1", user: "u1", created: "", expand: { user: { id: "u1", display_name: "Ana" } } },
        ]),
      },
      ["public_sets_log"],
    );

    const board = await buildChallengeLeaderboard(pb, CHALLENGE, "u1", "UTC");

    expect(board.entries).toHaveLength(1);
    expect(board.my_value).toBe(0);
  });

  it("el nombre cae a `name` y luego al email antes de pintar «?»", async () => {
    const { pb } = stubPb({
      challenge_participants: participants([
        { id: "p1", user: "u1", created: "a", expand: { user: { id: "u1", name: "Nombre" } } },
        { id: "p2", user: "u2", created: "b", expand: { user: { id: "u2", email: "bea@local.test" } } },
        { id: "p3", user: "u3", created: "c", expand: { user: { id: "u3" } } },
      ]),
      public_sets_log: [],
    });

    const board = await buildChallengeLeaderboard(pb, CHALLENGE, "u1", "UTC");

    expect(board.entries.map((e) => e.display_name)).toEqual(["Nombre", "bea", "?"]);
  });
});

describe("metricUnit", () => {
  it("cuenta cada métrica en su unidad, y los isométricos en segundos", () => {
    expect(metricUnit("exercise")).toBe("reps");
    expect(metricUnit("most_lsit")).toBe("s");
    expect(metricUnit("total_distance")).toBe("km");
    expect(metricUnit("custom")).toBe("");
  });
});

describe("countChallengeParticipants", () => {
  it("un conteo que falla queda FUERA del mapa en vez de entrar a 0", async () => {
    const { pb } = stubPb({}, ["challenge_participants"]);
    const counts = await countChallengeParticipants(pb, ["ch1"]);
    expect("ch1" in counts).toBe(false);
  });

  it("cuenta con el total de la página, no con las filas traídas", async () => {
    const { pb } = stubPb({ challenge_participants: [{ id: "p1" }, { id: "p2" }] });
    expect(await countChallengeParticipants(pb, ["ch1"])).toEqual({ ch1: 2 });
  });
});

describe("listMyOpenBattles", () => {
  it("ordena por last_activity_at: `battles` no tiene created/updated y PB daría 400", async () => {
    const { pb, calls } = stubPb({ battles: [{ id: "b1", status: "live" }] });
    await listMyOpenBattles(pb);
    expect(calls.battles[0].sort).toBe("-last_activity_at");
    expect(calls.battles[0].expand).toBe("battle_participants_via_battle");
  });
});

describe("batallas", () => {
  const CLOSED = rec({
    id: "b1",
    status: "finished",
    finished_at: "2026-08-20 10:00:00",
    config: { rounds: 3, exercises: [{}, {}] },
    final_standings: [
      { rank: 1, display_name: "Bea", user: "u2", status: "finished", score: { completed_rounds: 3, completed_reps: 30 } },
      { rank: 2, display_name: "Ana", user: "u1", status: "finished", score: { completed_rounds: 2, completed_reps: 20 } },
    ],
  });

  it("una batalla cerrada sirve el ranking congelado y marca dónde quedó el usuario", () => {
    const view = toClosedBattleView(CLOSED, "u1");

    expect(view.standings_source).toBe("stored");
    expect(view.standings[0].display_name).toBe("Bea");
    expect(view.my_rank).toBe(2);
    expect(view.rounds).toBe(3);
    expect(view.exercise_count).toBe(2);
  });

  it("sin final_standings el resultado es DESCONOCIDO, no una clasificación vacía", () => {
    const view = toClosedBattleView(rec({ id: "b0", status: "finished", final_standings: null }), "u1");

    expect(view.standings_source).toBe("none");
    expect(view.standings).toEqual([]);
    expect(view.my_rank).toBeNull();
  });

  it("el marcador vivo sale del endpoint /snapshot, no de battle_participants", async () => {
    const send = vi.fn(async () => ({
      battle: { id: "b9", status: "live", config: { rounds: 2, exercises: [{}] } },
      standings: [
        { rank: 1, display_name: "Ana", user: "u1", status: "active", score: { completed_rounds: 1, completed_reps: 10 } },
      ],
    }));
    const pb = { ...stubPb({}).pb, send } as unknown as PBWithSend;

    const view = await fetchBattleSnapshot(pb, "b9", "u1");

    expect(send).toHaveBeenCalledWith("/api/battles/b9/snapshot", expect.objectContaining({ method: "GET" }));
    expect(view?.standings_source).toBe("snapshot");
    expect(view?.my_rank).toBe(1);
  });

  it("si el snapshot no contesta devuelve null en vez de un marcador inventado", async () => {
    const pb = {
      ...stubPb({}).pb,
      send: vi.fn(async () => {
        throw new Error("503");
      }),
    } as unknown as PBWithSend;

    expect(await fetchBattleSnapshot(pb, "b9", "u1")).toBeNull();
  });
});
