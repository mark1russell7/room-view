import { headingOf, squared, turned } from "./direction.ts";
import { ROOM_SCHEMA, type Circuit, type Floor, type Opening, type Outlet, type PlanPoint, type Room, type Wall } from "./room.ts";
import { CLOSURE_LIMIT, convertSurvey, expandSurvey, type Survey, type SurveyOptions, type SurveyResult } from "./survey.ts";
import { LARGEST_LENGTH, metersPer, type LengthUnit } from "./units.ts";

/** The name of the format of a level record. */
export const LEVEL_SCHEMA = "level/1";

/** One room of a level: the survey of the room, with an `id`. */
export interface LevelRoom {
  readonly id: string;
  readonly survey: Survey;
}

/** One end of a connection: an opening of a room of the level. */
export interface ConnectionEnd {
  /** The `id` of the room. */
  readonly room: string;
  /** The `id` of the opening in the survey of that room. */
  readonly opening: string;
}

/**
 * A connection: one hole through the wall between two rooms, for example a door.
 * A person measures the hole in each room, so the survey of each room has it as an opening.
 */
export interface LevelConnection {
  readonly id: string;
  readonly from: ConnectionEnd;
  readonly to: ConnectionEnd;
  /**
   * The thickness of the wall at the hole: the distance between the faces of the wall in the two rooms.
   * A person measures it in the frame of a door. The default is the thickness of the wall of `from`.
   */
  readonly thickness?: number | undefined;
}

/**
 * A level: the rooms of one level of a building, for example the rooms of an apartment.
 *
 * Each room has its own survey, so each room has its own first corner and its own first direction.
 * A connection gives the place of a room: its two openings are one hole, so the two walls are back to back.
 */
export interface Level {
  readonly schema: typeof LEVEL_SCHEMA;
  readonly name?: string | undefined;
  /** The unit of each length of the room record of the level. A survey can have a different unit. */
  readonly unit: LengthUnit;
  readonly rooms: readonly LevelRoom[];
  readonly connections?: readonly LevelConnection[] | undefined;
  /** The circuits of the level. A survey can also have circuits. Two circuits with one `id` are one circuit, and the first one stays. */
  readonly circuits?: readonly Circuit[] | undefined;
}

/**
 * These are the sources of the place of a room.
 *
 * - `first`: the room is the first room of the level. It keeps the `start` and the `heading` of its survey.
 * - `connection`: a connection gives the place.
 * - `apart`: the room has no path of connections to a room before it, so its place is not known.
 */
export const ROOM_PLACES: readonly ["first", "connection", "apart"] = ["first", "connection", "apart"];

/** A source of the place of a room. */
export type RoomPlace = (typeof ROOM_PLACES)[number];

/** The result of one room of a level. */
export interface LevelRoomResult {
  /** The `id` of the room. */
  readonly id: string;
  readonly place: RoomPlace;
  /** The number of the group of the room, from 0. The rooms of one group have a path of connections between them. */
  readonly group: number;
  /** The survey of the room in the unit of the level. Its `start` and its `heading` are the place of the room in the level. */
  readonly survey: Survey;
  /** The expansion of that survey. */
  readonly result: SurveyResult;
}

/**
 * These are the uses of a connection.
 *
 * - `place`: the connection gives the place of a room.
 * - `check`: its two rooms have a place from other connections, so the connection examines the measurements.
 * - `none`: the connection has a fault, so the level does not use it.
 */
export const CONNECTION_USES: readonly ["place", "check", "none"] = ["place", "check", "none"];

/** A use of a connection. */
export type ConnectionUse = (typeof CONNECTION_USES)[number];

/**
 * These are the faults of a connection.
 *
 * - `room`: an end names a room that the level does not have.
 * - `opening`: an end names an opening that its room does not have, or the wall of the opening has no length.
 * - `one-room`: the two ends are in one room.
 */
export const CONNECTION_FAULTS: readonly ["room", "opening", "one-room"] = ["room", "opening", "one-room"];

/** A fault of a connection. */
export type ConnectionFault = (typeof CONNECTION_FAULTS)[number];

/** The result of one connection of a level. A connection with a fault has no numbers. */
export interface LevelConnectionResult {
  /** The `id` of the connection. */
  readonly id: string;
  readonly use: ConnectionUse;
  readonly fault?: ConnectionFault | undefined;
  /**
   * The distance between the two openings along the wall and through it, minus the thickness of the wall, in the unit of the level.
   * It is 0 for a connection that gives a place.
   */
  readonly gap: number | undefined;
  /** The gap as a part of the lengths of the walks of the two rooms. */
  readonly ratio: number | undefined;
  /** The angle between the two walls in degrees, from -180 to 180. Two walls that are back to back have 0. */
  readonly turn: number | undefined;
  /** The width of the opening of `to` minus the width of the opening of `from`, in the unit of the level. */
  readonly width: number | undefined;
  /** This value is true when the connection has no fault, its gap is in the limit, and its angle is `CONNECTION_TURN_LIMIT` or less. */
  readonly fits: boolean;
}

/** The result of the expansion of a level. */
export interface LevelResult {
  /**
   * One room record with each room of the level, in the unit of the level.
   * The `id` of a wall, an opening or an outlet is the `id` of its room, then `/`, then its `id` in the survey.
   * Each closed room gives one floor with the `id` and the name of the room.
   */
  readonly room: Room;
  /** The result of each room, in the sequence of the rooms. */
  readonly rooms: readonly LevelRoomResult[];
  /** The result of each connection, in the sequence of the connections. */
  readonly connections: readonly LevelConnectionResult[];
}

/** The options of the expansion of a level. */
export interface LevelOptions extends SurveyOptions {
  /** The distance between two groups of rooms, in the unit of the level. The default is 1 m. A value that is not a length of 0 or more gives the default. */
  readonly groupGap?: number | undefined;
}

/** The largest angle between the two walls of a connection that fits, in degrees. */
export const CONNECTION_TURN_LIMIT = 2;

/** A length in meters at this value or less is 0 for the level. */
const SMALL = 1e-6;

/** Two unit vectors with a cross product below this value are parallel. */
const PARALLEL = 1e-6;

/** The number of steps of the grid of calculated lengths in one unit. The noise of float arithmetic is much smaller than one step. */
const GRID = 1e9;

/** The place of a room in the level: the first corner of its walk, and the direction of its first side in degrees. */
interface Place {
  readonly start: PlanPoint;
  readonly heading: number;
}

/** An opening of a room, in the frame of its survey. The first corner is the origin, and the first side goes along the x axis. */
interface Hole {
  /** The position of the wall of the opening in the room record. */
  readonly wall: number;
  /** The center of the opening on the inner face of its wall. */
  readonly center: PlanPoint;
  /** The unit vector from the room through the wall. */
  readonly out: PlanPoint;
  readonly width: number;
  /** The thickness of the wall of the opening. */
  readonly thickness: number;
}

/** A connection with no fault: its two rooms as positions in the list of the rooms, and its two openings. */
interface Link {
  readonly from: number;
  readonly to: number;
  readonly fromHole: Hole;
  readonly toHole: Hole;
  /** The thickness of the wall at the hole. */
  readonly depth: number;
}

/** One wall of a room of the level, at its place. */
interface Face {
  readonly room: number;
  readonly wall: number;
  readonly from: PlanPoint;
  readonly to: PlanPoint;
  readonly along: PlanPoint;
  readonly out: PlanPoint;
  readonly length: number;
  readonly thickness: number;
}

/** This function gives the sum of two vectors of the plan. The second vector has a factor. */
function plus(a: PlanPoint, b: PlanPoint, factor = 1): PlanPoint {
  return [a[0] + b[0] * factor, a[1] + b[1] * factor];
}

/** This function gives the dot product of two vectors of the plan. */
function dot(a: PlanPoint, b: PlanPoint): number {
  return a[0] * b[0] + a[1] * b[1];
}

/** This function gives the cross product of two vectors of the plan. */
function cross(a: PlanPoint, b: PlanPoint): number {
  return a[0] * b[1] - a[1] * b[0];
}

/**
 * This function gives a calculated length on the grid. It removes the noise of float arithmetic,
 * so a place of 0.1 does not become 0.10000000000000009 in a file.
 */
function tidy(value: number): number {
  const steps = Math.round(value * GRID);
  // The sum with 0 changes -0 to 0.
  return Number.isSafeInteger(steps) ? steps / GRID + 0 : value;
}

/** This function gives a point of the frame of a room as a point of the level. */
function placed(place: Place, point: PlanPoint): PlanPoint {
  return plus(place.start, turned(point, place.heading));
}

/** This function gives the unit vector along a wall and the unit vector from the room through the wall. A wall with no length has no vectors. */
function vectorsOf(wall: Wall): { readonly along: PlanPoint; readonly out: PlanPoint; readonly length: number } | undefined {
  const dx = wall.to[0] - wall.from[0];
  const dy = wall.to[1] - wall.from[1];
  const length = Math.hypot(dx, dy);
  if (!(length > 0) || !Number.isFinite(length)) return undefined;
  const along: PlanPoint = [dx / length, dy / length];
  // The wall of a survey is on the outer side of its line.
  return { along, out: wall.side === "left" ? [0 - along[1], along[0]] : [along[1], 0 - along[0]], length };
}

/** This function gives an opening of a room in the frame of its survey. `own` is the expansion of the survey with no `start` and no `heading`. */
function holeOf(own: SurveyResult, id: string, inRange: (value: number) => boolean): Hole | undefined {
  const opening = own.room.openings?.find((item) => item.id === id);
  if (opening === undefined || !inRange(opening.offset) || !inRange(opening.width)) return undefined;
  const wall = own.room.walls.findIndex((item) => item.id === opening.wall);
  const record = own.room.walls[wall];
  const vectors = record === undefined ? undefined : vectorsOf(record);
  if (record === undefined || vectors === undefined) return undefined;
  return {
    wall,
    center: plus(record.from, vectors.along, opening.offset + opening.width / 2),
    out: vectors.out,
    width: opening.width,
    thickness: record.thickness ?? own.room.wallThickness,
  };
}

/**
 * This function gives the place of a room from a connection to a room that has a place.
 * The two walls are back to back, and the centers of the two openings are opposite, at the distance `depth`.
 */
function placeFrom(known: Place, knownHole: Hole, hole: Hole, depth: number): Place {
  const out = turned(knownHole.out, known.heading);
  const heading = squared(headingOf([0 - out[0], 0 - out[1]]) - headingOf(hole.out));
  const center = turned(hole.center, heading);
  const start = plus(plus(placed(known, knownHole.center), out, depth), center, -1);
  return { start: [tidy(start[0]), tidy(start[1])], heading };
}

/**
 * This function makes one room record from the rooms of a level.
 *
 * The first room keeps the `start` and the `heading` of its survey. The function goes from that room along the connections.
 * A connection to a room with no place gives the place of that room. The two walls are back to back, and the centers of the
 * two openings are opposite. The faces of the two walls are at the distance `thickness`.
 * A connection between two rooms that have a place examines the measurements: its `gap` and its `turn` tell a mistake.
 *
 * A room with no path of connections to a room before it starts a new group. Its place is not known,
 * so its group goes to the right of the groups before it. Thus a drawing of a level in progress shows each room.
 *
 * The survey of a room gives the thickness of each wall. Two rooms have one wall between them, so two walls that are
 * back to back share it. Each wall gets one half of the distance between the two faces.
 * This applies to the two walls of a connection, and to two walls that overlap.
 * A wall that is in part an outer wall gets the same thickness along its full length.
 *
 * `checkRoom` examines the room record. It tells when two rooms overlap.
 */
export function expandLevel(level: Level, options: LevelOptions = {}): LevelResult {
  const unit = level.unit;
  const scale = metersPer(unit);
  const inRange = (value: number): boolean => Number.isFinite(value) && Math.abs(value) * scale <= LARGEST_LENGTH;
  const size = (value: number | undefined): number | undefined => (value !== undefined && inRange(value) && value * scale > SMALL ? value : undefined);
  const count = level.rooms.length;
  const surveys = level.rooms.map((room) => convertSurvey(room.survey, unit));
  // Each room in the frame of its survey: the first corner is the origin, and the first side goes along the x axis.
  const owns = surveys.map((survey) => expandSurvey({ ...survey, start: undefined, heading: undefined }, options));

  const positionOf = new Map<string, number>();
  level.rooms.forEach((room, index) => {
    if (!positionOf.has(room.id)) positionOf.set(room.id, index);
  });

  const connections = level.connections ?? [];
  const faults: (ConnectionFault | undefined)[] = [];
  const links = connections.map((connection, index): Link | undefined => {
    const from = positionOf.get(connection.from.room);
    const to = positionOf.get(connection.to.room);
    if (from === undefined || to === undefined) {
      faults[index] = "room";
      return undefined;
    }
    if (from === to) {
      faults[index] = "one-room";
      return undefined;
    }
    const fromHole = holeOf(owns[from]!, connection.from.opening, inRange);
    const toHole = holeOf(owns[to]!, connection.to.opening, inRange);
    if (fromHole === undefined || toHole === undefined) {
      faults[index] = "opening";
      return undefined;
    }
    return { from, to, fromHole, toHole, depth: size(connection.thickness) ?? size(fromHole.thickness) ?? 0 };
  });

  // The place of each room: the function goes from the first room of each group along the connections.
  const places: Place[] = [];
  const sources: RoomPlace[] = [];
  const groups: number[] = [];
  const members: number[][] = [];
  const gives = new Set<number>();
  for (let root = 0; root < count; root++) {
    if (places[root] !== undefined) continue;
    const group = members.length;
    const survey = surveys[root]!;
    const heading = survey.heading !== undefined && Number.isFinite(survey.heading) ? survey.heading : 0;
    const start: PlanPoint = group === 0 && survey.start !== undefined && inRange(survey.start[0]) && inRange(survey.start[1]) ? survey.start : [0, 0];
    places[root] = { start, heading };
    sources[root] = group === 0 ? "first" : "apart";
    groups[root] = group;
    const queue = [root];
    for (let next = 0; next < queue.length; next++) {
      const known = queue[next]!;
      links.forEach((link, index) => {
        if (link === undefined) return;
        const forward = link.from === known;
        if (!forward && link.to !== known) return;
        const room = forward ? link.to : link.from;
        if (places[room] !== undefined) return;
        places[room] = placeFrom(places[known]!, forward ? link.fromHole : link.toHole, forward ? link.toHole : link.fromHole, link.depth);
        sources[room] = "connection";
        groups[room] = group;
        gives.add(index);
        queue.push(room);
      });
    }
    members.push(queue);
  }

  // A group with no known place goes to the right of the groups before it. The bottoms of the groups are on one line.
  const givenGap = options.groupGap;
  const groupGap = givenGap !== undefined && inRange(givenGap) && givenGap >= 0 ? givenGap : 1 / scale;
  let right: number | undefined;
  let base = 0;
  for (const [number, group] of members.entries()) {
    let low: PlanPoint | undefined;
    let high: PlanPoint | undefined;
    for (const room of group) {
      const survey = surveys[room]!;
      const margin = Math.max(0, ...[survey.wallThickness, ...survey.sides.map((side) => side.thickness)].map((value) => size(value) ?? 0));
      for (const point of [...owns[room]!.walk, ...owns[room]!.corners]) {
        const [x, y] = placed(places[room]!, point);
        low = low === undefined ? [x - margin, y - margin] : [Math.min(low[0], x - margin), Math.min(low[1], y - margin)];
        high = high === undefined ? [x + margin, y + margin] : [Math.max(high[0], x + margin), Math.max(high[1], y + margin)];
      }
    }
    if (low === undefined || high === undefined) continue;
    if (number === 0 || right === undefined) {
      right = right === undefined ? high[0] : Math.max(right, high[0]);
      if (number === 0) base = low[1];
      continue;
    }
    const move: PlanPoint = [right + groupGap - low[0], base - low[1]];
    for (const room of group) {
      const [x, y] = plus(places[room]!.start, move);
      places[room] = { start: [tidy(x), tidy(y)], heading: places[room]!.heading };
    }
    right = Math.max(right, high[0] + move[0]);
  }

  const rooms = level.rooms.map((room, index): LevelRoomResult => {
    const survey: Survey = { ...surveys[index]!, start: places[index]!.start, heading: places[index]!.heading };
    return { id: room.id, place: sources[index]!, group: groups[index]!, survey, result: expandSurvey(survey, options) };
  });

  // The measure of each connection, from the places of its two rooms.
  const givenLimit = options.limit ?? CLOSURE_LIMIT;
  const limit = Number.isFinite(givenLimit) && givenLimit >= 0 ? givenLimit : CLOSURE_LIMIT;
  const walkOf = (room: number): number => {
    const walk = owns[room]!.walk;
    return walk.reduce((sum, point, index) => (index === 0 ? 0 : sum + Math.hypot(point[0] - walk[index - 1]![0], point[1] - walk[index - 1]![1])), 0);
  };
  const results = connections.map((connection, index): LevelConnectionResult => {
    const link = links[index];
    if (link === undefined) return { id: connection.id, use: "none", fault: faults[index], gap: undefined, ratio: undefined, turn: undefined, width: undefined, fits: false };
    const width = link.toHole.width - link.fromHole.width;
    if (gives.has(index)) return { id: connection.id, use: "place", gap: 0, ratio: 0, turn: 0, width, fits: true };
    const from = places[link.from]!;
    const to = places[link.to]!;
    const out = turned(link.fromHole.out, from.heading);
    const back = turned(link.toHole.out, to.heading);
    const target = plus(placed(from, link.fromHole.center), out, link.depth);
    const center = placed(to, link.toHole.center);
    const miss = Math.hypot(center[0] - target[0], center[1] - target[1]);
    const walk = walkOf(link.from) + walkOf(link.to);
    const ratio = walk > 0 ? miss / walk : 0;
    const against: PlanPoint = [0 - out[0], 0 - out[1]];
    // The sum with 0 changes -0 to 0.
    const turn = (Math.atan2(cross(against, back), dot(against, back)) * 180) / Math.PI + 0;
    return { id: connection.id, use: "check", gap: miss, ratio, turn, width, fits: ratio <= limit && Math.abs(turn) <= CONNECTION_TURN_LIMIT };
  });

  // Each wall at its place. Two walls that are back to back share the wall between their rooms.
  const faces: Face[] = [];
  rooms.forEach(({ result }, room) => {
    result.room.walls.forEach((wall, index) => {
      const vectors = vectorsOf(wall);
      const thickness = size(wall.thickness ?? result.room.wallThickness);
      if (vectors === undefined || thickness === undefined) return;
      faces.push({ room, wall: index, from: wall.from, to: wall.to, along: vectors.along, out: vectors.out, length: vectors.length, thickness });
    });
  });
  const joined = new Set<string>();
  links.forEach((link, index) => {
    if (link === undefined || !results[index]!.fits) return;
    joined.add(`${link.from}:${link.fromHole.wall}:${link.to}:${link.toHole.wall}`);
    joined.add(`${link.to}:${link.toHole.wall}:${link.from}:${link.fromHole.wall}`);
  });
  const shared = new Map<string, number>();
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const a = faces[i]!;
      const b = faces[j]!;
      if (a.room === b.room || Math.abs(cross(a.along, b.along)) > PARALLEL || !(dot(a.out, b.out) < 0)) continue;
      const first: PlanPoint = [b.from[0] - a.from[0], b.from[1] - a.from[1]];
      const second: PlanPoint = [b.to[0] - a.from[0], b.to[1] - a.from[1]];
      const between = dot(first, a.out);
      const common = Math.min(a.length, Math.max(dot(first, a.along), dot(second, a.along))) - Math.max(0, Math.min(dot(first, a.along), dot(second, a.along)));
      if (!(between * scale > SMALL) || !(common * scale > SMALL)) continue;
      // The two walls of a connection are one wall. Two other walls are one wall when they overlap.
      if (!joined.has(`${a.room}:${a.wall}:${b.room}:${b.wall}`) && !((a.thickness + b.thickness - between) * scale > SMALL)) continue;
      const half = tidy(between / 2);
      for (const face of [a, b]) {
        const key = `${face.room}:${face.wall}`;
        shared.set(key, Math.min(shared.get(key) ?? Infinity, half));
      }
    }
  }

  const first = rooms[0]?.result.room;
  const height = first?.height ?? 1;
  const wallThickness = first?.wallThickness ?? 1;
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const floors: Floor[] = [];
  const outlets: Outlet[] = [];
  const circuits = new Map<string, Circuit>();
  for (const circuit of level.circuits ?? []) if (!circuits.has(circuit.id)) circuits.set(circuit.id, circuit);
  rooms.forEach(({ id, survey, result }, room) => {
    const record = result.room;
    record.walls.forEach((wall, index) => {
      const thickness = shared.get(`${room}:${index}`) ?? wall.thickness ?? (record.wallThickness === wallThickness ? undefined : record.wallThickness);
      const tall = wall.height ?? (record.height === height ? undefined : record.height);
      walls.push({
        id: `${id}/${wall.id}`,
        from: wall.from,
        to: wall.to,
        ...(wall.side === undefined ? {} : { side: wall.side }),
        ...(thickness === undefined ? {} : { thickness }),
        ...(tall === undefined ? {} : { height: tall }),
      });
    });
    for (const opening of record.openings ?? []) openings.push({ ...opening, id: `${id}/${opening.id}`, wall: `${id}/${opening.wall}` });
    for (const floor of record.floors ?? []) floors.push({ id, ...(survey.name === undefined ? {} : { name: survey.name }), ring: floor.ring });
    for (const outlet of record.outlets ?? []) outlets.push({ ...outlet, id: `${id}/${outlet.id}`, wall: `${id}/${outlet.wall}` });
    for (const circuit of record.circuits ?? []) if (!circuits.has(circuit.id)) circuits.set(circuit.id, circuit);
  });

  const room: Room = {
    schema: ROOM_SCHEMA,
    ...(level.name === undefined ? {} : { name: level.name }),
    unit,
    height,
    wallThickness,
    walls,
    ...(openings.length === 0 ? {} : { openings }),
    ...(floors.length === 0 ? {} : { floors }),
    ...(outlets.length === 0 ? {} : { outlets }),
    ...(circuits.size === 0 ? {} : { circuits: [...circuits.values()] }),
  };
  return { room, rooms, connections: results };
}
