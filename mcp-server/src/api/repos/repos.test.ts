import { describe, it, expect, vi } from "vitest";
import type { PB } from "./pb.js";
import { getUserSingleton, upsertUserSingleton, listUserRange } from "./pb.js";
import { getLatestLumbarCheck, upsertSettings } from "./user-singletons.js";
import { getCurrentProgram, setCurrentProgram, listProgramExercises, listProgramStats } from "./programs.js";
import { listSessions, listTodayNutritionEntries, listWeightEntries, SESSION_FIELDS } from "./activity.js";

// ─── PocketBase stub ────────────────────────────────────────────────────────
// `pb.filter` returns the template + params so assertions can check the exact
// query without a real server. Each collection method is a vi.fn the test
// programs per case.

type Coll = {
  getFirstListItem: ReturnType<typeof vi.fn>;
  getFullList: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function stubPb(): { pb: PB; coll: (name: string) => Coll; collections: Record<string, Coll> } {
  const collections: Record<string, Coll> = {};
  const coll = (name: string): Coll =>
    (collections[name] ??= {
      getFirstListItem: vi.fn(),
      getFullList: vi.fn(async () => []),
      update: vi.fn(async (id: string, data: unknown) => ({ id, ...(data as object) })),
      create: vi.fn(async (data: unknown) => ({ id: "new", ...(data as object) })),
    });
  const pb = {
    filter: (expr: string, params?: Record<string, unknown>) => JSON.stringify({ expr, params }),
    collection: (name: string) => coll(name),
  } as unknown as PB;
  return { pb, coll, collections };
}

const parseFilter = (raw: string) => JSON.parse(raw) as { expr: string; params: Record<string, unknown> };

describe("getUserSingleton / upsertUserSingleton", () => {
  it("reads the first `user = userId` row with requestKey null and swallows 404 into null", async () => {
    const { pb, coll } = stubPb();
    coll("settings").getFirstListItem.mockRejectedValueOnce(new Error("404"));
    expect(await getUserSingleton(pb, "settings", "u1")).toBeNull();

    coll("settings").getFirstListItem.mockResolvedValueOnce({ id: "s1", phase: 2 });
    expect(await getUserSingleton(pb, "settings", "u1")).toEqual({ id: "s1", phase: 2 });

    const [filter, opts] = coll("settings").getFirstListItem.mock.calls[0];
    expect(parseFilter(filter)).toEqual({ expr: "user = {:userId}", params: { userId: "u1" } });
    expect(opts).toMatchObject({ requestKey: null });
  });

  it("upsert updates the existing row, else creates it with user: userId", async () => {
    const { pb, coll } = stubPb();
    coll("nutrition_goals").getFirstListItem.mockResolvedValueOnce({ id: "g1" });
    await upsertUserSingleton(pb, "nutrition_goals", "u1", { daily_calories: 2000 });
    expect(coll("nutrition_goals").update).toHaveBeenCalledWith("g1", { daily_calories: 2000 });
    expect(coll("nutrition_goals").create).not.toHaveBeenCalled();

    coll("nutrition_goals").getFirstListItem.mockRejectedValueOnce(new Error("404"));
    await upsertUserSingleton(pb, "nutrition_goals", "u1", { daily_calories: 2100 });
    expect(coll("nutrition_goals").create).toHaveBeenCalledWith({ user: "u1", daily_calories: 2100 });
  });

  it("typed wrappers pin collection and sort", async () => {
    const { pb, coll } = stubPb();
    coll("lumbar_checks").getFirstListItem.mockResolvedValueOnce({ id: "l1" });
    await getLatestLumbarCheck(pb, "u1");
    expect(coll("lumbar_checks").getFirstListItem.mock.calls[0][1]).toMatchObject({ sort: "-date", requestKey: null });

    coll("settings").getFirstListItem.mockRejectedValueOnce(new Error("404"));
    await upsertSettings(pb, "u1", { phase: 3 });
    expect(coll("settings").create).toHaveBeenCalledWith({ user: "u1", phase: 3 });
  });
});

describe("listUserRange", () => {
  it("builds `>= from` alone or `>= from && <= to`, always with requestKey null", async () => {
    const { pb, coll } = stubPb();
    await listUserRange(pb, "sessions", "u1", { field: "completed_at", from: "2026-08-01 00:00:00" });
    let call = coll("sessions").getFullList.mock.calls[0][0];
    expect(parseFilter(call.filter)).toEqual({
      expr: "user = {:userId} && completed_at >= {:from}",
      params: { userId: "u1", from: "2026-08-01 00:00:00" },
    });
    expect(call.requestKey).toBeNull();

    await listUserRange(pb, "sessions", "u1", {
      field: "completed_at",
      from: "2026-08-01 00:00:00",
      to: "2026-08-07 23:59:59",
      fields: "id",
      sort: "completed_at",
    });
    call = coll("sessions").getFullList.mock.calls[1][0];
    expect(parseFilter(call.filter).expr).toBe("user = {:userId} && completed_at >= {:from} && completed_at <= {:to}");
    expect(call).toMatchObject({ fields: "id", sort: "completed_at", requestKey: null });
  });

  it("activity wrappers apply the family projection unless overridden", async () => {
    const { pb, coll } = stubPb();
    await listSessions(pb, "u1", { from: "x" });
    expect(coll("sessions").getFullList.mock.calls[0][0].fields).toBe(SESSION_FIELDS);
    await listSessions(pb, "u1", { from: "x", fields: "id,completed_at" });
    expect(coll("sessions").getFullList.mock.calls[1][0].fields).toBe("id,completed_at");

    await listWeightEntries(pb, "u1", { from: "2026-08-01", to: "2026-08-07" });
    expect(coll("weight_entries").getFullList.mock.calls[0][0]).toMatchObject({ sort: "date", fields: "id,weight_kg,date" });

    await listTodayNutritionEntries(pb, "u1", "2026-08-16");
    const f = parseFilter(coll("nutrition_entries").getFullList.mock.calls[0][0].filter);
    expect(f.params).toEqual({ userId: "u1", from: "2026-08-16 00:00:00" });
    expect(coll("nutrition_entries").getFullList.mock.calls[0][0].fields).toBeUndefined();
  });
});

describe("programs repo", () => {
  it("getCurrentProgram unwraps expand.program and returns null when unset", async () => {
    const { pb, coll } = stubPb();
    expect(await getCurrentProgram(pb, "u1")).toBeNull();

    coll("user_programs").getFullList.mockResolvedValueOnce([{ id: "up1", expand: { program: { id: "p1", name: "Base" } } }]);
    const cur = await getCurrentProgram(pb, "u1");
    expect(cur?.program.id).toBe("p1");
    expect(cur?.userProgram.id).toBe("up1");
    expect(coll("user_programs").getFullList.mock.calls[1][0]).toMatchObject({ expand: "program", requestKey: null });
  });

  it("setCurrentProgram deactivates current rows, then reuses the existing row or creates one", async () => {
    const { pb, coll } = stubPb();
    coll("user_programs").getFullList.mockResolvedValueOnce([{ id: "old1" }, { id: "old2" }]);
    coll("user_programs").getFirstListItem.mockResolvedValueOnce({ id: "mine" });
    await setCurrentProgram(pb, "u1", "p2");
    expect(coll("user_programs").update).toHaveBeenNthCalledWith(1, "old1", { is_current: false });
    expect(coll("user_programs").update).toHaveBeenNthCalledWith(2, "old2", { is_current: false });
    expect(coll("user_programs").update.mock.calls[2][0]).toBe("mine");
    expect(coll("user_programs").update.mock.calls[2][1]).toMatchObject({ is_current: true });
    expect(coll("user_programs").create).not.toHaveBeenCalled();

    coll("user_programs").getFullList.mockResolvedValueOnce([]);
    coll("user_programs").getFirstListItem.mockRejectedValueOnce(new Error("404"));
    await setCurrentProgram(pb, "u1", "p3");
    expect(coll("user_programs").create.mock.calls[0][0]).toMatchObject({ user: "u1", program: "p3", is_current: true });
  });

  it("listProgramExercises narrows by phase and day", async () => {
    const { pb, coll } = stubPb();
    await listProgramExercises(pb, "p1");
    expect(parseFilter(coll("program_exercises").getFullList.mock.calls[0][0].filter).expr).toBe("program = {:programId}");
    await listProgramExercises(pb, "p1", { phase: 2, dayId: "day_1", sort: "priority" });
    const call = coll("program_exercises").getFullList.mock.calls[1][0];
    expect(parseFilter(call.filter)).toEqual({
      expr: "program = {:programId} && phase_number = {:phase} && day_id = {:dayId}",
      params: { programId: "p1", phase: 2, dayId: "day_1" },
    });
    expect(call.sort).toBe("priority");
  });
});

// ─── listProgramStats (#669) ────────────────────────────────────────────────

describe("listProgramStats", () => {
  const row = (id: string, n: number) => ({
    id,
    active_count: n,
    completed_count: 1,
    followers_count: n + 1,
    athletes_count: n - 1,
  });

  it("mapea los cuatro conteos de la view", async () => {
    const { pb, coll } = stubPb();
    coll("view_program_stats").getFullList.mockResolvedValueOnce([row("p1", 4)]);

    expect(await listProgramStats(pb, ["p1"])).toEqual({
      p1: { active_count: 4, completed_count: 1, followers_count: 5, athletes_count: 3 },
    });
  });

  it("DEJA FUERA al programa que no vuelve, en vez de meterlo a cero", async () => {
    // Lo importante del issue: si la regla de lectura no casa, PocketBase
    // devuelve 0 filas sin error. Rellenar con ceros convertiría un fallo de
    // permisos en un «0 personas lo siguen» perfectamente creíble.
    const { pb, coll } = stubPb();
    coll("view_program_stats").getFullList.mockResolvedValueOnce([row("p1", 4)]);

    const stats = await listProgramStats(pb, ["p1", "p2"]);
    expect(stats.p1).toBeDefined();
    expect(stats.p2).toBeUndefined();
    expect("p2" in stats).toBe(false);
  });

  it("un 404 de la view no tumba la tool", async () => {
    // Un despliegue sin la migración de #620 no tiene la colección.
    const { pb, coll } = stubPb();
    coll("view_program_stats").getFullList.mockRejectedValueOnce(new Error("404"));

    expect(await listProgramStats(pb, ["p1"])).toEqual({});
  });

  it("trocea el filtro de 50 en 50 para no reventar la URL", async () => {
    const { pb, coll } = stubPb();
    const ids = Array.from({ length: 120 }, (_, i) => `p${i}`);
    coll("view_program_stats").getFullList.mockResolvedValue([]);

    await listProgramStats(pb, ids);
    expect(coll("view_program_stats").getFullList).toHaveBeenCalledTimes(3);
  });

  it("deduplica ids y no consulta con la lista vacía", async () => {
    const { pb, coll } = stubPb();
    coll("view_program_stats").getFullList.mockResolvedValue([]);

    await listProgramStats(pb, ["p1", "p1", ""]);
    const filter = parseFilter(coll("view_program_stats").getFullList.mock.calls[0][0].filter.split(" || ")[0]);
    expect(filter.params).toEqual({ id: "p1" });
    expect(coll("view_program_stats").getFullList.mock.calls[0][0].filter.split(" || ")).toHaveLength(1);

    expect(await listProgramStats(pb, [])).toEqual({});
    expect(coll("view_program_stats").getFullList).toHaveBeenCalledTimes(1);
  });
});
