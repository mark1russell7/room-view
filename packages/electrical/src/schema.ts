import { WALL_FACES, type AddOnV1, type FileKind, type LayerParse } from "@mark1russell7/room-view";
import { anchorSchema, READ_CONTEXT } from "@mark1russell7/room-view/schema";
import * as z from "zod/mini";
import { fromLevelV1, fromSceneV1, fromSurveyV1 } from "./convert.ts";
import { ELECTRICAL_SCHEMA, type ElectricalLayer } from "./layer.ts";

// The schema of an electrical layer in `zod/mini`, the read of its JSON and the read of the old records of version 1.
// This module is the entry `/schema` of the package, and it is the only module of the package that imports zod.
// The root entry has no zod, so a page that reads only the circuit math gets no schema library.

const id = z.string().check(z.minLength(1));

const outlet = z.strictObject({
  id,
  anchor: anchorSchema,
  circuit: z.optional(id),
});

const circuit = z.strictObject({
  id,
  name: z.optional(z.string()),
  breaker: z.optional(z.number()),
  voltage: z.optional(z.number()),
  limit: z.optional(z.number()),
  otherLoad: z.optional(z.number()),
});

const feed = z.strictObject({
  id,
  object: id,
  outlet: id,
  watts: z.optional(z.number()),
});

/**
 * The schema of an electrical layer. It examines the form of the record: the fields, their types and the finite numbers.
 * It refuses a field that the format does not have. `checkElectrical` examines the meaning of a layer with a correct form.
 */
export const electricalSchema: z.ZodMiniType<ElectricalLayer> = z.strictObject({
  schema: z.literal(ELECTRICAL_SCHEMA),
  outlets: z.optional(z.readonly(z.array(outlet))),
  circuits: z.optional(z.readonly(z.array(circuit))),
  feeds: z.optional(z.readonly(z.array(feed))),
});

/**
 * This function reads the JSON of an electrical layer. It gives the layer, or the faults of its form.
 * Each fault names its place in the record, for example `outlets.0.anchor`.
 */
export function parseElectrical(value: unknown): LayerParse<ElectricalLayer> {
  const read = electricalSchema.safeParse(value, READ_CONTEXT);
  if (read.success) return { ok: true, layer: read.data };
  return {
    ok: false,
    errors: read.error.issues.map((issue) => {
      const place = issue.path.length === 0 ? "the record" : `"${issue.path.map(String).join(".")}"`;
      return `The layer "${ELECTRICAL_SCHEMA}" has a fault at ${place}: ${issue.message}`;
    }),
  };
}

// The read of the old electrical records in the records of version 1 of the core. The read of the core removes these fields, and this part gives their layer.
// The read examines only the old electrical fields. The schema of the core examines each other field.

const circuits = z.optional(
  z.readonly(z.array(z.strictObject({ id, name: z.optional(z.string()), breaker: z.optional(z.number()), voltage: z.optional(z.number()), limit: z.number() }))),
);

// An outlet of a room. An outlet of a survey is on the inner face of its side, so it has no `face`.
const roomOutlets = z.optional(
  z.readonly(z.array(z.strictObject({ id, wall: id, face: z.enum(WALL_FACES), offset: z.number(), height: z.number(), circuit: z.optional(id) }))),
);
const surveyOutlets = z.optional(z.readonly(z.array(z.strictObject({ id, wall: id, offset: z.number(), height: z.number(), circuit: z.optional(id) }))));

// The objects with an outlet, at their places in the list. Each other item is `null`.
const objects = z.pipe(
  z.optional(z.readonly(z.array(z.nullable(z.strictObject({ id: z.string(), outlet: id }))))),
  z.transform((list: readonly ({ id: string; outlet: string } | null)[] | undefined) => list?.filter((object) => object !== null)),
);

const room = z.strictObject({ outlets: roomOutlets, circuits });
const scene = z.strictObject({
  room,
  objects,
  loads: z.optional(z.readonly(z.array(z.strictObject({ circuit: id, watts: z.number() })))),
});
const survey = z.strictObject({ outlets: surveyOutlets, circuits, objects });
const level = z.strictObject({ circuits });

/** The fields of each kind of record of version 1 that keep the old electrical records. */
const FIELDS = {
  room: ["outlets", "circuits"],
  scene: ["loads"],
  survey: ["outlets", "circuits"],
  level: ["circuits"],
  object: ["outlet"],
} as const satisfies AddOnV1<ElectricalLayer>["fields"];

type Json = Readonly<Record<string, unknown>>;

/** This function tells if a value is a JSON object. */
function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function gives the fields of a record with these names, when the record has them. */
function pick(record: Json, names: readonly string[]): Json {
  return Object.fromEntries(names.filter((name) => Object.hasOwn(record, name)).map((name) => [name, record[name]]));
}

/** This function gives the `id` and the outlet of each object with an outlet, at its place in the list. Each other item is `null`. */
function objectsOf(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((object: unknown) => (isJson(object) && Object.hasOwn(object, "outlet") ? pick(object, ["id", "outlet"]) : null));
}

/** This function gives the old electrical fields of a record, with their places. A record of another form keeps no field: the core tells its fault. */
function partsOf(record: Json, kind: FileKind): Json {
  if (kind === "room" || kind === "level") return pick(record, FIELDS[kind]);
  const own = pick(record, FIELDS[kind]);
  const list = objectsOf(record["objects"]);
  const withObjects = list?.some((object) => object !== null) === true ? { ...own, objects: list } : own;
  if (kind === "survey") return withObjects;
  return { ...withObjects, room: isJson(record["room"]) ? pick(record["room"], FIELDS.room) : {} };
}

/** This function tells if the parts of a record have an old field. */
function hasParts(parts: Json): boolean {
  return Object.keys(parts).some((key) => key !== "room") || (isJson(parts["room"]) && Object.keys(parts["room"]).length > 0);
}

/** This function gives the faults of a read. Each fault names its place in the record, for example `room.outlets.0.face`. */
function faultsOf(error: z.core.$ZodError, kind: FileKind): readonly string[] {
  return error.issues.map((issue) => `The old electrical records of the ${kind} have a fault at "${issue.path.map(String).join(".")}": ${issue.message}`);
}

/** This function gives the layer, or `undefined` for a layer with no record. */
function made(layer: ElectricalLayer): LayerParse<ElectricalLayer> | undefined {
  return layer.outlets === undefined && layer.circuits === undefined && layer.feeds === undefined ? undefined : { ok: true, layer };
}

/**
 * This function gives the electrical layer of the old records of a record of version 1. The record is the JSON of a file, or of the survey of a room of a level.
 * It gives `undefined` for a record with no old electrical record, for example a record with empty lists.
 * A room record has no objects and no loads, so its layer has outlets and circuits only.
 */
function readV1(record: unknown, kind: FileKind): LayerParse<ElectricalLayer> | undefined {
  if (!isJson(record)) return undefined;
  const parts = partsOf(record, kind);
  if (!hasParts(parts)) return undefined;
  if (kind === "room") {
    const read = room.safeParse(parts, READ_CONTEXT);
    return read.success ? made(fromSceneV1({ room: read.data })) : { ok: false, errors: faultsOf(read.error, kind) };
  }
  if (kind === "scene") {
    const read = scene.safeParse(parts, READ_CONTEXT);
    return read.success ? made(fromSceneV1(read.data)) : { ok: false, errors: faultsOf(read.error, kind) };
  }
  if (kind === "survey") {
    const read = survey.safeParse(parts, READ_CONTEXT);
    return read.success ? made(fromSurveyV1(read.data)) : { ok: false, errors: faultsOf(read.error, kind) };
  }
  const read = level.safeParse(parts, READ_CONTEXT);
  return read.success ? made(fromLevelV1(read.data)) : { ok: false, errors: faultsOf(read.error, kind) };
}

/** The read of the old electrical records in the records of version 1 of the core: the value `v1` of the add-on. */
export const electricalV1: AddOnV1<ElectricalLayer> = { fields: FIELDS, read: readV1 };
