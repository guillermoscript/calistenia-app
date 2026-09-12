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
import { buildCatalogIndex } from "@calistenia/core/lib/catalogIndex";
import type { PB, RecordModel } from "./repos/pb.js";
import { buildServerExerciseResolver } from "./exercise-identity-server.js";
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

/**
 * Resolutor ciego: sin catálogo ni programa, cada id es su propia identidad.
 * Es lo que aísla los tests del criterio de récord de los de fusión (abajo), y
 * evita que dependan de lo que haya hoy en `data/exercise-catalog.json`.
 */
const RAW = { resolver: buildServerExerciseResolver({ index: null, programExercises: [] }) };

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
      RAW,
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
      RAW,
    );

    expect(prs.reps.pullup).toBe(12);
  });

  it("de un rango de reps toma el número alto", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "dip", reps: "8-12" }]),
      "u1",
      SETTINGS,
      RAW,
    );

    expect(prs.reps.dip).toBe(12);
  });

  it("una serie sin número ('max') no inventa un récord", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "burpee", reps: "max" }]),
      "u1",
      SETTINGS,
      RAW,
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
      RAW,
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
      RAW,
    );

    expect(prs.weight.weighted_pullup).toMatchObject({ weight: 60, reps: 8, e1rm: 76 });
  });

  it("actualiza el espejo legacy cuando una serie supera lo guardado", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "pullup", reps: "20" }]),
      "u1",
      rec({ ...SETTINGS, pr_pullups: 15 }),
      RAW,
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
      RAW,
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
      RAW,
    );

    expect(topRepRecords(prs, 2)).toEqual([
      { exercise_id: "b", name: "b", best: 30, unit: "reps" },
      { exercise_id: "c", name: "c", best: 12, unit: "reps" },
    ]);
  });
});

describe("fusión por identidad resuelta (#702)", () => {
  const INDEX = buildCatalogIndex({
    categories: {
      push: {
        exercises: [
          { id: "pushup_std", name: { es: "Flexiones", en: "Push-up" } },
          { id: "plank", name: { es: "Plancha", en: "Plank" }, isTimer: true },
        ],
      },
    },
  });
  const PROGRAM = [rec({ phase_number: 1, day_id: "mie", exercise_id: "mie_1_10", exercise_name: { es: "Plancha" }, is_timer: true })];
  const MERGING = { resolver: buildServerExerciseResolver({ index: INDEX, programExercises: PROGRAM }) };

  it("el id retirado y su heredero son UN récord, con el mejor de los dos", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([
        { exercise_id: "pushup", workout_key: "p1_lun", reps: "20" },
        { exercise_id: "pushup_std", workout_key: "p1_lun", reps: "25" },
        { exercise_id: "pushup", workout_key: "p1_lun", reps: "28" },
      ]),
      "u1",
      SETTINGS,
      MERGING,
    );

    expect(prs.reps).toEqual({ pushup_std: 28 });
    expect(prs.exercises.pushup_std).toMatchObject({ name: "Flexiones", exercise_ids: ["pushup", "pushup_std"], is_timer: false });
    expect(prs.tracked_exercises).toBe(1);
    // El espejo legacy sale del id RESUELTO, que sigue casando con `pushup`.
    expect(prs.legacy.pushups).toBe(28);
  });

  it("la clave de slot del programa activo suma con el id de catálogo", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([
        { exercise_id: "mie_1_10", workout_key: "p1_mie", reps: "45" },
        { exercise_id: "plank", workout_key: "free_1", reps: "40" },
      ]),
      "u1",
      SETTINGS,
      MERGING,
    );

    expect(prs.reps).toEqual({ plank: 45 });
    expect(prs.exercises.plank).toMatchObject({ exercise_ids: ["mie_1_10", "plank"], is_timer: true });
    expect(topRepRecords(prs)).toEqual([
      { exercise_id: "plank", name: "Plancha", best: 45, unit: "s", merged_from: ["mie_1_10", "plank"] },
    ]);
  });

  it("lo que el resolutor no conoce se queda aparte, con su id crudo", async () => {
    const prs = await resolvePersonalRecords(
      stubPb([{ exercise_id: "mystery_move", workout_key: "free_1", reps: "9" }]),
      "u1",
      SETTINGS,
      MERGING,
    );

    expect(prs.reps).toEqual({ mystery_move: 9 });
    expect(prs.exercises.mystery_move.resolved).toBe(false);
  });
});
