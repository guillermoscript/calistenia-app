/**
 * Lo que el servidor partía en dos (#702): `pushup` y `pushup_std`, y la
 * plancha del programa bajo su clave de slot frente a `plank`. Los tests
 * afirman la FUSIÓN, no que la función devuelva algo: sin resolutor, agrupar
 * por id crudo también «devuelve algo», y ese era el bug.
 *
 * El catálogo es de mentira (`buildCatalogIndex`) para no depender de lo que
 * haya hoy en `data/exercise-catalog.json`, y las filas de programa son las
 * mínimas que mira `toWorkouts`.
 */

import { describe, it, expect } from "vitest";
import { buildCatalogIndex } from "@calistenia/core/lib/catalogIndex";
import type { RecordModel } from "./repos/pb.js";
import { buildServerExerciseResolver, groupSetsByIdentity } from "./exercise-identity-server.js";

const INDEX = buildCatalogIndex({
  categories: {
    push: {
      exercises: [
        { id: "pushup_std", name: { es: "Flexiones", en: "Push-up" }, seed_slug: "push-up", muscle_groups: ["chest"] },
        { id: "plank", name: { es: "Plancha", en: "Plank" }, isTimer: true, muscle_groups: ["core"] },
        { id: "muscle_up", name: { es: "Muscle up", en: "Muscle up" } },
      ],
    },
  },
});

const rec = (row: Record<string, unknown>): RecordModel =>
  ({ id: "r", collectionId: "c", collectionName: "c", ...row }) as RecordModel;

/** Programa activo: tres slots, uno con el `exercise_name` como slug (#687) y otro que no está en el catálogo. */
const PROGRAM = [
  rec({ phase_number: 1, day_id: "mie", exercise_id: "mie_1_10", exercise_name: { es: "Plancha" }, muscles: { es: "core" }, is_timer: true }),
  rec({ phase_number: 1, day_id: "lun", exercise_id: "lun_1_2", exercise_name: { es: "pushup_std" }, muscles: { es: "pecho" } }),
  rec({ phase_number: 1, day_id: "jue", exercise_id: "jue_1_3", exercise_name: { es: "Remo invertido casero" }, muscles: { es: "espalda" } }),
];

const resolver = buildServerExerciseResolver({ index: INDEX, programExercises: PROGRAM });

describe("buildServerExerciseResolver", () => {
  it("un id retirado se funde con su heredero", () => {
    const r = resolver.resolve("pushup", "p1_lun");
    expect(r.key).toBe("pushup_std");
    expect(r.name).toBe("Flexiones");
    expect(r.resolved).toBe(true);
  });

  it("la clave de slot del programa activo resuelve por su nombre al id de catálogo", () => {
    const r = resolver.resolve("mie_1_10", "p1_mie");
    expect(r.key).toBe("plank");
    expect(r.isTimer).toBe(true);
  });

  it("identityOf encuentra el workout_key de un slot cuando quien llama sólo tiene el id", () => {
    expect(resolver.identityOf("mie_1_10").key).toBe("plank");
  });

  it("un exercise_name que es un slug del catálogo (#687) también resuelve", () => {
    expect(resolver.identityOf("lun_1_2").key).toBe("pushup_std");
  });

  it("un slot que no está en el catálogo conserva identidad propia, sin adivinar", () => {
    const r = resolver.identityOf("jue_1_3");
    expect(r.resolved).toBe(true);
    expect(r.key).toBe("remo invertido casero");
    expect(r.name).toBe("Remo invertido casero");
  });

  it("lo que nadie conoce se queda con su id crudo", () => {
    const r = resolver.resolve("mystery_move", "free_abc");
    expect(r).toMatchObject({ key: "mystery_move", name: "mystery_move", resolved: false });
  });

  it("sin índice de catálogo degrada a los ids crudos en vez de romper", () => {
    const blind = buildServerExerciseResolver({ index: null, programExercises: PROGRAM });
    expect(blind.resolve("pushup", "p1_lun").key).toBe("pushup");
    expect(blind.aliasesOf("pushup").ids).toEqual(["pushup"]);
    // El slot sigue teniendo nombre: el programa activo no depende del catálogo.
    expect(blind.identityOf("mie_1_10").name).toBe("Plancha");
  });
});

describe("aliasesOf", () => {
  it("reúne el id canónico, el retirado y la clave de slot del mismo ejercicio", () => {
    const { identity, ids } = resolver.aliasesOf("pushup_std");
    expect(identity.key).toBe("pushup_std");
    expect(new Set(ids)).toEqual(new Set(["pushup_std", "pushup", "lun_1_2"]));
  });

  it("da lo mismo entrar por el id retirado o por la clave de slot", () => {
    expect(new Set(resolver.aliasesOf("pushup").ids)).toEqual(new Set(["pushup_std", "pushup", "lun_1_2"]));
    expect(new Set(resolver.aliasesOf("lun_1_2").ids)).toEqual(new Set(["pushup_std", "pushup", "lun_1_2"]));
  });

  it("un id desconocido sólo se filtra a sí mismo", () => {
    expect(resolver.aliasesOf("mystery_move")).toMatchObject({ ids: ["mystery_move"], identity: { resolved: false } });
  });
});

describe("groupSetsByIdentity", () => {
  it("fusiona en un grupo las series del mismo ejercicio bajo ids distintos", () => {
    const groups = groupSetsByIdentity(
      [
        { exercise_id: "pushup", workout_key: "p1_lun", reps: "20" },
        { exercise_id: "mie_1_10", workout_key: "p1_mie", reps: "45" },
        { exercise_id: "pushup_std", workout_key: "free_1", reps: "25" },
        { exercise_id: "plank", workout_key: "free_1", reps: "40" },
        { exercise_id: "mystery_move", workout_key: "free_1", reps: "3" },
      ],
      resolver,
    );

    expect(groups.map((g) => g.key)).toEqual(["pushup_std", "plank", "mystery_move"]);
    expect(groups[0]).toMatchObject({ name: "Flexiones", exercise_ids: ["pushup", "pushup_std"], is_timer: false });
    expect(groups[0].sets.map((s) => s.reps)).toEqual(["20", "25"]);
    expect(groups[1]).toMatchObject({ name: "Plancha", exercise_ids: ["mie_1_10", "plank"], is_timer: true });
    expect(groups[2]).toMatchObject({ resolved: false, exercise_ids: ["mystery_move"] });
  });
});
