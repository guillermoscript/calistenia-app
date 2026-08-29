/**
 * Lo que el servidor tenía mal de los récords (#666): servía cinco espejos
 * heredados y no sabía nada del resto.
 *
 * Los tests afirman el caso POSITIVO —el récord de un ejercicio SIN campo
 * legacy, que es justo lo que antes no se podía contar— y no solo que la
 * función devuelva algo: eso pasaría igual leyendo los cinco `pr_*` viejos,
 * que es el bug.
 */

import { describe, it, expect, vi } from "vitest";
import type { PB, RecordModel } from "./repos/pb.js";
import { resolvePersonalRecords, topRepRecords } from "./prs-server.js";

const rec = (row: Record<string, unknown>): RecordModel =>
  ({ collectionId: "c", collectionName: "c", ...row }) as RecordModel;

/** PB con un solo `sets_log`; el resto de colecciones no se tocan aquí. */
function stubPb(sets: Record<string, unknown>[]): PB {
  return {
    filter: (expr: string, params?: Record<string, unknown>) => JSON.stringify({ expr, params }),
    collection: () => ({ getFullList: vi.fn(async () => sets.map(rec)) }),
  } as unknown as PB;
}

/** Fila de `settings` con los cinco espejos a cero. */
const SETTINGS = rec({ id: "s1", user: "u1", phase: 3, weekly_goal: 5 });

describe("resolvePersonalRecords", () => {
  it("saca el récord de un ejercicio que NO tiene campo legacy", async () => {
    // `muscle_up` no casa con ninguno de los 5 PR_PATTERNS, así que antes de
    // #666 el servidor no tenía forma de saber que existía.
    const prs = await resolvePersonalRecords(
      stubPb([
        { exercise_id: "muscle_up", reps: "3" },
        { exercise_id: "muscle_up", reps: "5" },
      ]),
      "u1",
      SETTINGS,
    );

    expect(prs.reps.muscle_up).toBe(5);
    expect(prs.tracked_exercises).toBe(1);
  });

  it("se queda con la mejor serie, no con la última", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([
        { exercise_id: "pullup", reps: "12" },
        { exercise_id: "pullup", reps: "7" },
      ]),
      "u1",
      SETTINGS,
    );

    expect(prs.reps.pullup).toBe(12);
  });

  it("de un rango de reps toma el número alto", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "dip", reps: "8-12" }]),
      "u1",
      SETTINGS,
    );

    expect(prs.reps.dip).toBe(12);
  });

  it("una serie sin número ('max') no inventa un récord", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "burpee", reps: "max" }]),
      "u1",
      SETTINGS,
    );

    expect(prs.reps.burpee).toBeUndefined();
    expect(prs.tracked_exercises).toBe(0);
  });

  it("en un ejercicio de temporizador el récord son SEGUNDOS", async () => {
    // Los cronómetros guardan los segundos en `reps`: 45 aquí es 45 s de
    // plancha, no 45 repeticiones. Mismo criterio que el cliente.
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "plank", reps: "45" }]),
      "u1",
      SETTINGS,
    );

    expect(prs.reps.plank).toBe(45);
  });

  it("el récord de peso sale por 1RM estimado, no por el peso bruto", async () => {
    // 60 kg × 8 → e1RM 76 · 70 kg × 1 → e1RM 70. Gana la primera aunque
    // levante menos kilos.
    const prs = await resolvePersonalRecords(
      stubPb([
        { exercise_id: "weighted_pullup", reps: "8", weight_kg: 60 },
        { exercise_id: "weighted_pullup", reps: "1", weight_kg: 70 },
      ]),
      "u1",
      SETTINGS,
    );

    expect(prs.weight.weighted_pullup).toMatchObject({ weight: 60, reps: 8, e1rm: 76 });
  });

  it("actualiza el espejo legacy cuando una serie supera lo guardado", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "pullup", reps: "20" }]),
      "u1",
      rec({ ...SETTINGS, pr_pullups: 15 }),
    );

    expect(prs.legacy.pullups).toBe(20);
  });

  it("NO borra un récord tecleado a mano que nadie registró como serie", async () => {
    // El espejo guardado hace de suelo: si el usuario apuntó 15 dominadas y
    // solo tiene series de 10, sigue reportándose 15.
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "pullup", reps: "10" }]),
      "u1",
      rec({ ...SETTINGS, pr_pullups: 15 }),
    );

    expect(prs.legacy.pullups).toBe(15);
  });

  it("sin series devuelve los espejos y los mapas vacíos", async () => {
    const prs = await resolvePersonalRecords(stubPb([]), "u1", rec({ ...SETTINGS, pr_lsit: 30 }));

    expect(prs.reps).toEqual({});
    expect(prs.weight).toEqual({});
    expect(prs.legacy.l_sit).toBe(30);
    expect(prs.tracked_exercises).toBe(0);
  });

  it("sin fila de settings tampoco lanza", async () => {
    const prs = await resolvePersonalRecords(stubPb([{ exercise_id: "squat", reps: "30" }]), "u1", null);

    expect(prs.reps.squat).toBe(30);
    expect(prs.legacy.pullups).toBe(0);
  });
});

describe("topRepRecords", () => {
  it("ordena de mayor a menor y corta al límite", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([
        { exercise_id: "a", reps: "5" },
        { exercise_id: "b", reps: "30" },
        { exercise_id: "c", reps: "12" },
      ]),
      "u1",
      SETTINGS,
    );

    expect(topRepRecords(prs, 2)).toEqual([
      { exercise_id: "b", best: 30 },
      { exercise_id: "c", best: 12 },
    ]);
  });
});
