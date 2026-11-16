import { z } from "zod";
import { LEVEL_SCHEMA, type Level } from "./level.ts";
import { isLayerName, OPENING_KINDS, ROOM_SCHEMA, SCENE_SCHEMA, WALL_FACES, WALL_SIDES, type Room, type Scene } from "./room.ts";
import { SQUARE_TURNS, SURVEY_SCHEMA, type Survey } from "./survey.ts";
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
  // The core does not read a layer, so it keeps each value. The add-on of a layer examines its form.
  layers: z.record(z.string().refine(isLayerName, "A layer name is a word, a slash and a version, for example electrical/1."), z.unknown()).readonly().optional(),
});

const surveySide = z.strictObject({
  id,
  length: z.number(),
  turn: z.union([z.enum(SQUARE_TURNS), z.number()]),
  thickness: z.number().optional(),
  height: z.number().optional(),
});

const surveyCheck = z.strictObject({
  id,
  from: id,
  to: id,
  length: z.number(),
});

const surveyOutlet = z.strictObject({
  id,
  wall: id,
  offset: z.number(),
  height: z.number(),
  circuit: id.optional(),
});

const surveyObject = z.strictObject({
  id,
  kind: z.string().min(1),
  name: z.string().optional(),
  wall: id.optional(),
  on: id.optional(),
  offset: z.number(),
  width: z.number(),
  depth: z.number(),
  height: z.number(),
  gap: z.number().optional(),
  lift: z.number().optional(),
  outlet: id.optional(),
});

/**
 * The schema of a survey record. It examines the form of the record, and it refuses a field that the format does not have.
 * `expandSurvey` makes the room record of a survey with a correct form, and `checkRoom` examines that room record.
 */
export const surveySchema: z.ZodType<Survey> = z.strictObject({
  schema: z.literal(SURVEY_SCHEMA),
  name: z.string().optional(),
  unit: z.enum(LENGTH_UNITS),
  height: z.number(),
  wallThickness: z.number(),
  sides: z.array(surveySide).readonly(),
  start: planPoint.optional(),
  heading: z.number().optional(),
  checks: z.array(surveyCheck).readonly().optional(),
  openings: z.array(opening).readonly().optional(),
  outlets: z.array(surveyOutlet).readonly().optional(),
  circuits: z.array(circuit).readonly().optional(),
  objects: z.array(surveyObject).readonly().optional(),
});

const connectionEnd = z.strictObject({
  room: id,
  opening: id,
});

/**
 * The schema of a level record. It examines the form of the record and of each survey, and it refuses a field that the format does not have.
 * `expandLevel` makes the room record of a level with a correct form, and `checkRoom` examines that room record.
 */
export const levelSchema: z.ZodType<Level> = z.strictObject({
  schema: z.literal(LEVEL_SCHEMA),
  name: z.string().optional(),
  unit: z.enum(LENGTH_UNITS),
  rooms: z.array(z.strictObject({ id, survey: surveySchema })).readonly(),
  connections: z
    .array(z.strictObject({ id, from: connectionEnd, to: connectionEnd, thickness: z.number().optional() }))
    .readonly()
    .optional(),
  circuits: z.array(circuit).readonly().optional(),
});
