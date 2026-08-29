/**
 * Lo que el servidor tenía mal de la épica #599 (#663): la fase que reportaba y
 * la dosis que servía.
 *
 * Estos tests afirman los casos POSITIVOS, no solo que no reviente: la fase
 * derivada, la del override, y la dosis ya progresada. Un test que solo
 * comprobara «devuelve algo» pasaría igual con el `settings.phase` viejo, que
 * es justo el bug.
 */

import { describe, it, expect, vi } from "vitest";
import type { PB, RecordModel } from "./repos/pb.js";
import { resolveActiveProgramProgress } from "./program-progress-server.js";
import { resolveProgramExercises, toProgramOverrides } from "./program-overrides-server.js";

// ─── PocketBase stub ────────────────────────────────────────────────────────
// Mismo patrón que repos.test.ts: `filter` devuelve plantilla + params, y cada
// colección responde lo que el caso programe.

type Rows = Record<string, unknown>[];

/**
 * Fixture → `RecordModel`. El SDK exige `collectionId`/`collectionName` en cada
 * registro y a estas pruebas no les dicen nada, así que se rellenan aquí en vez
 * de repetirlos en cada fila.
 */
const rec = (row: Record<string, unknown>): RecordModel =>
  ({ collectionId: "c", collectionName: "c", ...row }) as RecordModel;

function stubPb(data: Record<string, Rows>): PB {
  return {
    filter: (expr: string, params?: Record<string, unknown>) => JSON.stringify({ expr, params }),
    collection: (name: string) => ({
      getFullList: vi.fn(async () => data[name] ?? []),
      getFirstListItem: vi.fn(async () => {
        const row = (data[name] ?? [])[0];
        if (!row) throw new Error("404");
        return row;
      }),
    }),
  } as unknown as PB;
}

/** Programa de 12 semanas, dos fases: 1-6 y 7-12. */
const PHASES = [
  { id: "ph1", phase_number: 1, name: "Base", weeks: "1-6", color: "#0f0", bg_color: "#010" },
  { id: "ph2", phase_number: 2, name: "Fuerza", weeks: "7-12", color: "#f00", bg_color: "#100" },
];

const DAY_CONFIG = [
  { id: "d1", phase_number: 1, day_id: "lun", day_name: "Lunes", day_focus: "Push", day_type: "push" },
  { id: "d2", phase_number: 1, day_id: "mar", day_name: "Martes", day_focus: "Descanso", day_type: "rest" },
  { id: "d3", phase_number: 2, day_id: "lun", day_name: "Lunes", day_focus: "Push", day_type: "push" },
];

function world(enrollment: Record<string, unknown>, extra: Record<string, Rows> = {}) {
  return stubPb({
    user_programs: [
      {
        id: "up1",
        user: "u1",
        program: "p1",
        is_current: true,
        started_at: "2026-06-01T08:00:00.000Z",
        expand: { program: { id: "p1", name: "Oficial", duration_weeks: 12 } },
        ...enrollment,
      },
    ],
    program_phases: PHASES,
    program_day_config: DAY_CONFIG,
    settings: [{ id: "s1", user: "u1", phase: 4 }],
    sessions: [],
    ...extra,
  });
}

describe("resolveActiveProgramProgress", () => {
  it("deriva la fase de las semanas transcurridas y NO de settings.phase", async () => {
    // Empezó el 1 de junio; el 20 de julio es la semana 8 → fase 2.
    // `settings.phase` vale 4, que es justo lo que se leía antes y no existe
    // como fase de este programa.
    const active = await resolveActiveProgramProgress(world({}), "u1", "UTC", "2026-07-20");

    expect(active?.progress.currentPhase).toBe(2);
    expect(active?.progress.phaseSource).toBe("derived");
    expect(active?.progress.currentWeek).toBe(8);
    expect(active?.progress.totalWeeks).toBe(12);
  });

  it("el override manual de la inscripción gana sobre la derivada", async () => {
    const active = await resolveActiveProgramProgress(
      world({ current_phase: 1 }),
      "u1",
      "UTC",
      "2026-07-20",
    );

    expect(active?.progress.currentPhase).toBe(1);
    expect(active?.progress.phaseSource).toBe("override");
  });

  it("los días planificados salen de la fase EN CURSO, no de todo el programa", async () => {
    // La fase 1 tiene un día entrenable (lun) y uno de descanso (mar); la fase 2
    // tiene solo lun. Sumar las dos daría 2 y la semana parecería más exigente
    // de lo que es.
    const active = await resolveActiveProgramProgress(world({ current_phase: 1 }), "u1", "UTC", "2026-07-20");

    expect(active?.weekDays.map((d) => d.id)).toEqual(["lun", "mar"]);
    expect(active?.progress.plannedThisWeek).toBe(1);
  });

  it("cuenta las sesiones de la semana en curso por su día LOCAL", async () => {
    const active = await resolveActiveProgramProgress(
      world({}, {
        sessions: [
          { id: "s1", workout_key: "p2_lun", completed_at: "2026-07-20T10:00:00.000Z" },
          // Duplicado exacto (mismo día, misma clave): no puede contar dos veces.
          { id: "s2", workout_key: "p2_lun", completed_at: "2026-07-20T18:00:00.000Z" },
          // Fuera de la ventana de esta semana.
          { id: "s3", workout_key: "p1_lun", completed_at: "2026-06-02T10:00:00.000Z" },
        ],
      }),
      "u1",
      "UTC",
      "2026-07-20",
    );

    expect(active?.progress.sessionsThisWeek).toBe(1);
  });

  it("sin fases de donde derivar cae en settings.phase, como el cliente", async () => {
    const pb = stubPb({
      user_programs: [
        {
          id: "up1",
          user: "u1",
          program: "p1",
          is_current: true,
          started_at: "",
          expand: { program: { id: "p1", name: "Suelto", duration_weeks: 0 } },
        },
      ],
      program_phases: [],
      program_day_config: [],
      settings: [{ id: "s1", user: "u1", phase: 4 }],
      sessions: [],
    });

    const active = await resolveActiveProgramProgress(pb, "u1", "UTC", "2026-07-20");
    expect(active?.progress.currentPhase).toBe(4);
  });

  it("sin programa activo devuelve null en vez de lanzar", async () => {
    const pb = stubPb({ user_programs: [] });
    expect(await resolveActiveProgramProgress(pb, "u1", "UTC", "2026-07-20")).toBeNull();
  });
});

describe("resolveProgramExercises", () => {
  const rows = [
    rec({
      id: "pe1",
      exercise_id: "lun_1_1",
      exercise_name: "Flexiones",
      sets: 3,
      reps: "10",
      rest_seconds: 90,
      muscles: "pecho",
      is_timer: false,
      section: "main",
    }),
    rec({
      id: "pe2",
      exercise_id: "lun_1_2",
      exercise_name: "Plancha",
      sets: 3,
      reps: "30",
      rest_seconds: 60,
      muscles: "core",
      is_timer: true,
      section: "main",
    }),
  ];

  it("sin overrides sirve exactamente lo prescrito", () => {
    const out = resolveProgramExercises(rows, []);
    expect(out.map((e) => e.reps)).toEqual(["10", "30"]);
    expect(out.every((e) => !e.auto_progressed)).toBe(true);
  });

  it("aplica la dosis aceptada y la marca", () => {
    const overrides = toProgramOverrides([rec({ id: "o1", exercise_id: "lun_1_1", reps_override: "12" })]);
    const out = resolveProgramExercises(rows, overrides);

    expect(out[0]).toMatchObject({ reps: "12", auto_progressed: true });
    expect(out[1]).toMatchObject({ reps: "30", auto_progressed: false });
  });

  it("en un ejercicio de temporizador sube TAMBIÉN los segundos del cronómetro", () => {
    const overrides = toProgramOverrides([rec({ id: "o1", exercise_id: "lun_1_2", reps_override: "35" })]);
    const out = resolveProgramExercises(rows, overrides);

    expect(out[1]).toMatchObject({ reps: "35", timer_seconds: 35 });
  });

  it("una variante aceptada viaja en variant_of sin cambiar la clave del hueco", () => {
    const overrides = toProgramOverrides([rec({ id: "o1", exercise_id: "lun_1_1", exercise_id_override: "archer-push-up" })]);
    const out = resolveProgramExercises(rows, overrides);

    expect(out[0].exercise_id).toBe("lun_1_1");
    expect(out[0].variant_of).toBe("archer-push-up");
    expect(out[0].auto_progressed).toBe(true);
  });

  it("un override que no casa con ningún hueco se ignora", () => {
    const overrides = toProgramOverrides([rec({ id: "o1", exercise_id: "borrado_9_9", reps_override: "99" })]);
    const out = resolveProgramExercises(rows, overrides);

    expect(out.map((e) => e.reps)).toEqual(["10", "30"]);
  });
});
