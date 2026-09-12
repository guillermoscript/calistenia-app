/**
 * Data-access layer of the MCP tools (#480). See ./pb.ts for the rules.
 *
 * What lives here: the reads/writes that several tools repeat (per-user
 * singletons, ranged activity reads, current program). One-off CRUD calls
 * (`getOne` + `delete` of a record the tool just looked up, dynamic collection
 * names in media.ts, `createBatch()` flows) stay inline in the tool on
 * purpose — wrapping them would add a hop without removing repetition.
 */

export * from "./pb.js";
export * from "./user-singletons.js";
export * from "./programs.js";
export * from "./activity.js";
export * from "./social.js";
