import * as z from "zod/mini";
import en from "zod/v4/locales/en.js";
import type { Anchor } from "./anchors.ts";
import type { FindingLevel } from "./check.ts";
import { FILE_KINDS, type AddOn, type FileKind } from "./layers.ts";
import { LEVEL_SCHEMA, type Level } from "./level.ts";
import { isLayerName, OPENING_KINDS, ROOM_SCHEMA, SCENE_SCHEMA, WALL_FACES, WALL_SIDES, type Room, type Scene } from "./room.ts";
import { SQUARE_TURNS, SURVEY_SCHEMA, type Survey } from "./survey.ts";
import { LENGTH_UNITS } from "./units.ts";

// The schemas use `zod/mini`: a page gets only the parts of zod that the schemas use.
// `zod/mini` has no messages, so each read gives the English messages of zod with `READ_CONTEXT`. It changes no setting of zod.

/** The parse context of each read of this entry and of each add-on: the faults have the English messages of zod. */
export const READ_CONTEXT: z.core.ParseContext<z.core.$ZodIssue> = { error: en().localeError };

const id = z.string().check(z.minLength(1));
const planPoint = z.readonly(z.tuple([z.number(), z.number()]));

const point3 = z.readonly(z.tuple([z.number(), z.number(), z.number()]));

/**
 * The schema of an anchor. It examines the form of the record, and it refuses a field that the surface of the anchor does not have.
 * The schema of an add-on uses it for the anchor of each record. `checkAnchor` examines the meaning of an anchor with a correct form.
 */
export const anchorSchema: z.ZodMiniType<Anchor> = z.discriminatedUnion("on", [
  z.strictObject({ on: z.literal("wall"), wall: id, face: z.enum(WALL_FACES), offset: z.number(), height: z.number() }),
  z.strictObject({ on: z.literal("floor"), at: planPoint, floor: z.optional(id) }),
  z.strictObject({ on: z.literal("ceiling"), at: planPoint, floor: z.optional(id) }),
  z.strictObject({ on: z.literal("object"), object: id, at: z.optional(point3), out: z.optional(point3) }),
]);

const wall = z.strictObject({
  id,
  from: planPoint,
  to: planPoint,
  thickness: z.optional(z.number()),
  height: z.optional(z.number()),
  side: z.optional(z.enum(WALL_SIDES)),
});

const opening = z.strictObject({
  id,
  wall: id,
  kind: z.enum(OPENING_KINDS),
  offset: z.number(),
  width: z.number(),
  sill: z.optional(z.number()),
  height: z.number(),
});

const floor = z.strictObject({
  id,
  name: z.optional(z.string()),
  ring: z.readonly(z.array(planPoint)),
});

/**
 * The schema of a room record. It examines the form of the record: the fields, their types and the finite numbers.
 * It refuses a field that the format does not have. `checkRoom` examines the meaning of a record with a correct form.
 */
export const roomSchema: z.ZodMiniType<Room> = z.strictObject({
  schema: z.literal(ROOM_SCHEMA),
  name: z.optional(z.string()),
  unit: z.enum(LENGTH_UNITS),
  height: z.number(),
  wallThickness: z.number(),
  walls: z.readonly(z.array(wall)),
  openings: z.optional(z.readonly(z.array(opening))),
  floors: z.optional(z.readonly(z.array(floor))),
});

const placedObject = z.strictObject({
  id,
  kind: id,
  name: z.optional(z.string()),
  size: point3,
  at: planPoint,
  lift: z.optional(z.number()),
  turn: z.optional(z.number()),
  parent: z.optional(id),
});

// The layers of a scene, of a survey or of a level. The core does not read a layer, so it keeps each value. The add-on of a layer examines its form.
const layerName = z.string().check(z.refine(isLayerName, "A layer name is a word, a slash and a version, for example electrical/1."));
const layers = z.optional(z.readonly(z.record(layerName, z.unknown())));

/**
 * The schema of a scene record. It examines the form of the record, and it refuses a field that the format does not have.
 * `checkScene` examines the meaning of a record with a correct form.
 */
export const sceneSchema: z.ZodMiniType<Scene> = z.strictObject({
  schema: z.literal(SCENE_SCHEMA),
  name: z.optional(z.string()),
  room: roomSchema,
  objects: z.optional(z.readonly(z.array(placedObject))),
  layers,
});

const surveySide = z.strictObject({
  id,
  length: z.number(),
  turn: z.union([z.enum(SQUARE_TURNS), z.number()]),
  thickness: z.optional(z.number()),
  height: z.optional(z.number()),
});

const surveyCheck = z.strictObject({
  id,
  from: id,
  to: id,
  length: z.number(),
});

const surveyObject = z.strictObject({
  id,
  kind: id,
  name: z.optional(z.string()),
  wall: z.optional(id),
  on: z.optional(id),
  offset: z.number(),
  width: z.number(),
  depth: z.number(),
  height: z.number(),
  gap: z.optional(z.number()),
  lift: z.optional(z.number()),
});

/**
 * The schema of a survey record. It examines the form of the record, and it refuses a field that the format does not have.
 * `expandSurvey` makes the room record of a survey with a correct form, and `checkRoom` examines that room record.
 */
export const surveySchema: z.ZodMiniType<Survey> = z.strictObject({
  schema: z.literal(SURVEY_SCHEMA),
  name: z.optional(z.string()),
  unit: z.enum(LENGTH_UNITS),
  height: z.number(),
  wallThickness: z.number(),
  sides: z.readonly(z.array(surveySide)),
  start: z.optional(planPoint),
  heading: z.optional(z.number()),
  checks: z.optional(z.readonly(z.array(surveyCheck))),
  openings: z.optional(z.readonly(z.array(opening))),
  objects: z.optional(z.readonly(z.array(surveyObject))),
  layers,
});

const connectionEnd = z.strictObject({
  room: id,
  opening: id,
});

/**
 * The schema of a level record. It examines the form of the record and of each survey, and it refuses a field that the format does not have.
 * `expandLevel` makes the room record of a level with a correct form, and `checkRoom` examines that room record.
 */
export const levelSchema: z.ZodMiniType<Level> = z.strictObject({
  schema: z.literal(LEVEL_SCHEMA),
  name: z.optional(z.string()),
  unit: z.enum(LENGTH_UNITS),
  rooms: z.readonly(z.array(z.strictObject({ id, survey: surveySchema }))),
  connections: z.optional(z.readonly(z.array(z.strictObject({ id, from: connectionEnd, to: connectionEnd, thickness: z.optional(z.number()) })))),
  layers,
});

/** The record of each kind, in version 2. */
export interface KindRecords {
  readonly room: Room;
  readonly scene: Scene;
  readonly survey: Survey;
  readonly level: Level;
}

/** These are the codes of the findings of `readRecord`. */
export const READ_CODES: readonly ["read-both"] = ["read-both"];

/** A finding of the read of a record of version 1. The read keeps the record, so a finding is not an error. */
export interface ReadFinding {
  readonly level: FindingLevel;
  /** A code of `READ_CODES`. */
  readonly code: string;
  /** The key of the layer in the record. */
  readonly layer: string;
  /** The `id` of the room of a level with the finding. A finding of the record has none. */
  readonly room?: string | undefined;
  /** The finding in plain words. */
  readonly message: string;
}

/** The result of `readRecord`: the record in version 2, its kind and its version in the file, or the faults of its form. */
export type RecordRead =
  | {
      readonly [Kind in FileKind]: {
        readonly ok: true;
        readonly kind: Kind;
        readonly record: KindRecords[Kind];
        /** The version of the format in the file. */
        readonly version: 1 | 2;
        readonly findings: readonly ReadFinding[];
      };
    }[FileKind]
  | { readonly ok: false; readonly errors: readonly string[] };

const KIND_NAMES: { readonly [Kind in FileKind]: string } = { room: ROOM_SCHEMA, scene: SCENE_SCHEMA, survey: SURVEY_SCHEMA, level: LEVEL_SCHEMA };

type Json = Readonly<Record<string, unknown>>;

/** This function tells if a value is a JSON object. */
function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function gives the schema name of version 2 for a nested record of version 1. A different name stays, so the read tells its fault. */
function newName(record: Json, kind: FileKind): unknown {
  return record["schema"] === `${kind}/1` ? KIND_NAMES[kind] : record["schema"];
}

/** This function gives the faults of a zod read. Each fault names its place in the record, for example `rooms.0.survey.sides`. */
function faultsOf(error: z.core.$ZodError): readonly string[] {
  return error.issues.map((issue) => `${issue.path.length === 0 ? "The record" : `"${issue.path.map(String).join(".")}"`}: ${issue.message}`);
}

/**
 * This function reads the JSON of a record of the core in version 1 or in version 2. The record is a room, a scene, a survey or a level.
 * The result is the record in version 2. The schemas of this entry examine its form.
 *
 * A record of version 1 kept the records of some topics in fields of its own. For each add-on of the list with the read `v1`:
 *
 * - The read removes the fields of the add-on from the record, from each object and from each nested record.
 * - The function `read` of the add-on gives the layer of these fields. For a scene, this layer has the records of its room too.
 *   For a level, the level record and the survey of each room get a layer.
 * - A record that has the layer and the old fields keeps the layer. The finding `read-both` tells it.
 *
 * A field of version 1 that no add-on of the list removes is a fault of the form. A room record has no layers.
 * Thus a `room/1` with old records gives a `scene/2` with the room and the layers, and a `room/1` with none gives a `room/2`.
 */
export function readRecord(value: unknown, addOns: readonly AddOn<unknown>[] = []): RecordRead {
  if (!isJson(value)) return { ok: false, errors: ["The record is not a JSON object."] };
  const name = value["schema"];
  const kind = FILE_KINDS.find((each) => KIND_NAMES[each] === name);
  if (kind !== undefined) return parsed(kind, value, 2, []);
  const old = FILE_KINDS.find((each) => `${each}/1` === name);
  if (old === undefined) return { ok: false, errors: [`The record has no known format: "schema" is ${JSON.stringify(name) ?? "missing"}.`] };
  const readers = addOns.filter((addOn) => addOn.v1 !== undefined);
  const findings: ReadFinding[] = [];
  const errors: string[] = [];
  const without = (record: Json, of: FileKind | "object"): Record<string, unknown> => {
    const gone = new Set(readers.flatMap((addOn) => addOn.v1?.fields[of] ?? []));
    return Object.fromEntries(Object.entries(record).filter(([key]) => !gone.has(key)));
  };
  const objectsOf = (record: Record<string, unknown>): void => {
    const objects = record["objects"];
    if (Array.isArray(objects)) record["objects"] = objects.map((object: unknown) => (isJson(object) ? without(object, "object") : object));
  };
  // The layers of the old fields of one record. A layer that the record has already stays.
  const withLayers = (record: Record<string, unknown>, raw: Json, of: FileKind, room?: string): void => {
    const given = isJson(raw["layers"]) ? raw["layers"] : {};
    const layers: Record<string, unknown> = { ...given };
    for (const addOn of readers) {
      const read = addOn.v1?.read(raw, of);
      if (read === undefined) continue;
      if (!read.ok) {
        errors.push(...read.errors);
        continue;
      }
      if (Object.hasOwn(given, addOn.schema)) {
        findings.push({
          level: "warning",
          code: "read-both",
          layer: addOn.schema,
          ...(room === undefined ? {} : { room }),
          message: `The record has the layer "${addOn.schema}" and its old fields. The layer stays, and the old fields go.`,
        });
        continue;
      }
      layers[addOn.schema] = read.layer;
    }
    if (Object.keys(layers).length > 0) record["layers"] = layers;
  };
  const surveyOf = (raw: Json, room?: string): Record<string, unknown> => {
    const record = { ...without(raw, "survey"), schema: newName(raw, "survey") };
    objectsOf(record);
    withLayers(record, raw, "survey", room);
    return record;
  };
  const roomOf = (raw: unknown): unknown => (isJson(raw) ? { ...without(raw, "room"), schema: newName(raw, "room") } : raw);
  let next: unknown;
  let made: FileKind = old;
  if (old === "survey") next = surveyOf(value);
  else if (old === "level") {
    const level: Record<string, unknown> = { ...without(value, "level"), schema: LEVEL_SCHEMA };
    const rooms = value["rooms"];
    if (Array.isArray(rooms)) {
      level["rooms"] = rooms.map((room: unknown) => {
        if (!isJson(room) || !isJson(room["survey"])) return room;
        return { ...room, survey: surveyOf(room["survey"], typeof room["id"] === "string" ? room["id"] : undefined) };
      });
    }
    withLayers(level, value, "level");
    next = level;
  } else if (old === "scene") {
    const scene: Record<string, unknown> = { ...without(value, "scene"), schema: SCENE_SCHEMA, room: roomOf(value["room"]) };
    objectsOf(scene);
    withLayers(scene, value, "scene");
    next = scene;
  } else {
    // A room record has no layers, so the layers of its old fields need a scene.
    const scene: Record<string, unknown> = { schema: SCENE_SCHEMA, room: roomOf(value) };
    withLayers(scene, value, "room");
    if (scene["layers"] === undefined) next = scene["room"];
    else {
      next = scene;
      made = "scene";
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return parsed(made, next, 1, findings);
}

/** This function reads a record of version 2 with the schema of its kind. */
function parsed(kind: FileKind, value: unknown, version: 1 | 2, findings: readonly ReadFinding[]): RecordRead {
  if (kind === "room") {
    const read = roomSchema.safeParse(value, READ_CONTEXT);
    return read.success ? { ok: true, kind, record: read.data, version, findings } : { ok: false, errors: faultsOf(read.error) };
  }
  if (kind === "scene") {
    const read = sceneSchema.safeParse(value, READ_CONTEXT);
    return read.success ? { ok: true, kind, record: read.data, version, findings } : { ok: false, errors: faultsOf(read.error) };
  }
  if (kind === "survey") {
    const read = surveySchema.safeParse(value, READ_CONTEXT);
    return read.success ? { ok: true, kind, record: read.data, version, findings } : { ok: false, errors: faultsOf(read.error) };
  }
  const read = levelSchema.safeParse(value, READ_CONTEXT);
  return read.success ? { ok: true, kind, record: read.data, version, findings } : { ok: false, errors: faultsOf(read.error) };
}
