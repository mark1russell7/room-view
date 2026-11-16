import { z } from "zod";
import { OPENING_KINDS, ROOM_SCHEMA, SCENE_SCHEMA, WALL_FACES, WALL_SIDES, type Room, type Scene } from "./room.ts";
import { LENGTH_UNITS } from "./units.ts";

const id = z.string().min(1);
const planPoint = z.tuple([z.number(), z.number()]).readonly();

const wall = z.strictObject({
  id,
  from: planPoint,
  to: planPoint,
  thickness: z.number().optional(),
  height: z.number().optional(),
  side: z.enum(WALL_SIDES).optional(),
});

const opening = z.strictObject({
  id,
  wall: id,
  kind: z.enum(OPENING_KINDS),
  offset: z.number(),
  width: z.number(),
  sill: z.number().optional(),
  height: z.number(),
});

const floor = z.strictObject({
  id,
  name: z.string().optional(),
  ring: z.array(planPoint).readonly(),
});

const outlet = z.strictObject({
  id,
  wall: id,
  face: z.enum(WALL_FACES),
  offset: z.number(),
  height: z.number(),
  circuit: id.optional(),
});

const circuit = z.strictObject({
  id,
  name: z.string().optional(),
  limit: z.number(),
});

/**
 * The schema of a room record. It examines the form of the record: the fields, their types and the finite numbers.
 * It refuses a field that the format does not have. `checkRoom` examines the meaning of a record with a correct form.
 */
export const roomSchema: z.ZodType<Room> = z.strictObject({
  schema: z.literal(ROOM_SCHEMA),
  name: z.string().optional(),
  unit: z.enum(LENGTH_UNITS),
  height: z.number(),
  wallThickness: z.number(),
  walls: z.array(wall).readonly(),
  openings: z.array(opening).readonly().optional(),
  floors: z.array(floor).readonly().optional(),
  outlets: z.array(outlet).readonly().optional(),
  circuits: z.array(circuit).readonly().optional(),
});

const placedObject = z.strictObject({
  id,
  kind: z.string().min(1),
  name: z.string().optional(),
  size: z.tuple([z.number(), z.number(), z.number()]).readonly(),
  at: planPoint,
  lift: z.number().optional(),
  turn: z.number().optional(),
  parent: id.optional(),
  outlet: id.optional(),
});

const circuitLoad = z.strictObject({
  circuit: id,
  watts: z.number(),
});

/**
 * The schema of a scene record. It examines the form of the record, and it refuses a field that the format does not have.
 * `checkScene` examines the meaning of a record with a correct form.
 */
export const sceneSchema: z.ZodType<Scene> = z.strictObject({
  schema: z.literal(SCENE_SCHEMA),
  name: z.string().optional(),
  room: roomSchema,
  objects: z.array(placedObject).readonly().optional(),
  loads: z.array(circuitLoad).readonly().optional(),
});
