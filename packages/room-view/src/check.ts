import { convexOverlap, pointInRing, regionArea, transformPoint3, type Ring, type Transform3 } from "@mark1russell7/layout-contract";
import { wallFrames, wallHasOutline } from "./frames.ts";
import { wallFootprints, type JoinOptions } from "./joins.ts";
import type { PlacedObject, Room, Scene } from "./room.ts";
import { objectTransforms } from "./solids.ts";
import { LARGEST_LENGTH, metersPer } from "./units.ts";

/** These are the levels of a finding. An error is a fault that the model cannot show. A warning is a fault that the model can show. */
export const FINDING_LEVELS: readonly ["error", "warning"] = ["error", "warning"];

/** A level of a finding. */
export type FindingLevel = (typeof FINDING_LEVELS)[number];

/** These are the kinds of the records that a finding can name. */
export const RECORD_KINDS: readonly ["room", "wall", "opening", "floor", "outlet", "circuit", "object", "load"] = [
  "room",
  "wall",
  "opening",
  "floor",
  "outlet",
  "circuit",
  "object",
  "load",
];

/** A kind of record. */
export type RecordKind = (typeof RECORD_KINDS)[number];

/** These are the codes of the findings. */
export const FINDING_CODES: readonly [
  "number-not-finite",
  "number-too-large",
  "id-duplicate",
  "size-not-positive",
  "wall-length",
  "wall-short",
  "wall-overlap",
  "opening-wall",
  "opening-range",
  "opening-height",
  "opening-overlap",
  "outlet-wall",
  "outlet-circuit",
  "outlet-range",
  "outlet-in-opening",
  "floor-ring",
  "circuit-limit",
  "object-parent",
  "object-cycle",
  "object-outlet",
  "object-outside",
  "object-overlap",
  "object-in-wall",
  "load-circuit",
  "load-watts",
] = [
  "number-not-finite",
  "number-too-large",
  "id-duplicate",
  "size-not-positive",
  "wall-length",
  "wall-short",
  "wall-overlap",
  "opening-wall",
  "opening-range",
  "opening-height",
  "opening-overlap",
  "outlet-wall",
  "outlet-circuit",
  "outlet-range",
  "outlet-in-opening",
  "floor-ring",
  "circuit-limit",
  "object-parent",
  "object-cycle",
  "object-outlet",
  "object-outside",
  "object-overlap",
  "object-in-wall",
  "load-circuit",
  "load-watts",
];

/** A code of a finding. */
export type FindingCode = (typeof FINDING_CODES)[number];

/** A finding: one fault of a room record or a scene record. */
export interface Finding {
  readonly level: FindingLevel;
  readonly code: FindingCode;
  /** The kind of the record with the fault. */
  readonly record: RecordKind;
  /** The `id` of the record with the fault. For a load, it is the `id` of the circuit. For the room record, it is empty. */
  readonly at: string;
  /** The fault in plain words, with the values. */
  readonly message: string;
}

/** The options of the checks. Give the options that the model gets. */
export interface CheckOptions {
  /** The options of the corners of the walls. */
  readonly joins?: JoinOptions | undefined;
}

/** A length in meters at this value or less is 0 for the checks: a size must be above it. */
const SMALL = 1e-6;

/** This function gives a number with 3 decimals at most. */
function show(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** This function tells if a value is a number that is not finite, or if it holds such a number. */
function holdsBadNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some((item) => holdsBadNumber(item));
  if (typeof value === "object" && value !== null) return Object.values(value).some((item) => holdsBadNumber(item));
  return false;
}

/** This function tells if a value is a finite number with a size above a limit, or if it holds such a number. */
function holdsLargeNumber(value: unknown, limit: number): boolean {
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) > limit;
  if (Array.isArray(value)) return value.some((item) => holdsLargeNumber(item, limit));
  if (typeof value === "object" && value !== null) return Object.values(value).some((item) => holdsLargeNumber(item, limit));
  return false;
}

/** This function gives each value that a list has two or more times. */
function repeated(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) twice.add(id);
    seen.add(id);
  }
  return [...twice];
}

/**
 * This function gives each fault of a room record. A room with no finding of the level `error` gives a full model.
 *
 * The function examines the meaning of the record: for example, an opening must be in its wall. The schema examines the form of the record.
 */
export function checkRoom(room: Room, options: CheckOptions = {}): readonly Finding[] {
  const findings: Finding[] = [];
  const error = (code: FindingCode, record: RecordKind, at: string, message: string): void => {
    findings.push({ level: "error", code, record, at, message });
  };
  const warning = (code: FindingCode, record: RecordKind, at: string, message: string): void => {
    findings.push({ level: "warning", code, record, at, message });
  };
  const scale = metersPer(room.unit);
  /** The largest length of the model, in the unit of the room. */
  const largest = LARGEST_LENGTH / scale;
  /** This function tells if a size of the record is 0 for the checks. */
  const none = (size: number): boolean => !(size * scale > SMALL);
  const openings = room.openings ?? [];
  const outlets = room.outlets ?? [];
  const circuits = room.circuits ?? [];
  const floors = room.floors ?? [];

  if (holdsBadNumber([room.height, room.wallThickness])) error("number-not-finite", "room", "", "The height or the wall thickness of the room is not a finite number.");
  if (holdsLargeNumber([room.height, room.wallThickness], largest)) error("number-too-large", "room", "", `The height or the wall thickness of the room is above 1 000 km, the largest length of the model.`);
  const lists: readonly (readonly [RecordKind, readonly { readonly id: string }[]])[] = [
    ["wall", room.walls],
    ["opening", openings],
    ["floor", floors],
    ["outlet", outlets],
    ["circuit", circuits],
  ];
  for (const [record, list] of lists) {
    for (const item of list) {
      if (holdsBadNumber(item)) error("number-not-finite", record, item.id, `A number of the ${record} "${item.id}" is not finite.`);
      // The limit of a circuit is a power, not a length.
      if (record !== "circuit" && holdsLargeNumber(item, largest)) error("number-too-large", record, item.id, `A length of the ${record} "${item.id}" is above 1 000 km, the largest length of the model.`);
    }
    for (const id of repeated(list.map((item) => item.id))) error("id-duplicate", record, id, `Two or more records of the kind ${record} have the id "${id}".`);
  }

  if (none(room.height)) error("size-not-positive", "room", "", `The height of the room is ${show(room.height)}. It must be above 0.`);
  if (none(room.wallThickness)) error("size-not-positive", "room", "", `The wall thickness of the room is ${show(room.wallThickness)}. It must be above 0.`);

  const frames = wallFrames(room);
  const footprints = wallFootprints(frames, options.joins);
  frames.forEach((frame, index) => {
    const wall = room.walls[index]!;
    if (wall.thickness !== undefined && none(wall.thickness)) error("size-not-positive", "wall", wall.id, `The thickness of the wall "${wall.id}" is ${show(wall.thickness)}. It must be above 0.`);
    if (wall.height !== undefined && none(wall.height)) error("size-not-positive", "wall", wall.id, `The height of the wall "${wall.id}" is ${show(wall.height)}. It must be above 0.`);
    const [clearFrom, clearTo] = footprints[index]!.clear;
    if (!(frame.length > SMALL)) error("wall-length", "wall", wall.id, `The wall "${wall.id}" has the length 0: its two ends are one point.`);
    else if (wallHasOutline(frame) && !(clearTo - clearFrom > SMALL)) warning("wall-short", "wall", wall.id, `The wall "${wall.id}" is too short for the corners at its ends: no part of it has its full thickness.`);
  });
  for (let i = 0; i < footprints.length; i++) {
    for (let j = i + 1; j < footprints.length; j++) {
      const a = footprints[i]!;
      const b = footprints[j]!;
      if (a.ring.length < 3 || b.ring.length < 3 || !(convexOverlap(a.ring, b.ring) > SMALL)) continue;
      warning("wall-overlap", "wall", a.wall, `The walls "${a.wall}" and "${b.wall}" overlap. Walls connect only at their ends: divide a wall at the point where a different wall crosses it.`);
    }
  }

  const frameOf = new Map(frames.map((frame, index) => [frame.id, { frame, footprint: footprints[index]! }] as const));
  const holes = new Map<string, { id: string; from: number; to: number; sill: number; top: number }[]>();
  for (const opening of openings) {
    const found = frameOf.get(opening.wall);
    if (found === undefined) {
      error("opening-wall", "opening", opening.id, `The opening "${opening.id}" is on the wall "${opening.wall}", which the room does not have.`);
      continue;
    }
    if (none(opening.width)) error("size-not-positive", "opening", opening.id, `The width of the opening "${opening.id}" is ${show(opening.width)}. It must be above 0.`);
    if (none(opening.height)) error("size-not-positive", "opening", opening.id, `The height of the opening "${opening.id}" is ${show(opening.height)}. It must be above 0.`);
    if (none(opening.width) || none(opening.height)) continue;
    const from = opening.offset * scale;
    const to = (opening.offset + opening.width) * scale;
    const sill = (opening.sill ?? 0) * scale;
    const top = sill + opening.height * scale;
    const [clearFrom, clearTo] = found.footprint.clear;
    if (from < clearFrom - SMALL || to > clearTo + SMALL) {
      error(
        "opening-range",
        "opening",
        opening.id,
        `The opening "${opening.id}" is from ${show(opening.offset)} to ${show(opening.offset + opening.width)} along the wall "${opening.wall}". The straight part of that wall is from ${show(clearFrom / scale)} to ${show(clearTo / scale)}.`,
      );
    }
    if (sill < 0 || top > found.frame.height + SMALL) {
      error(
        "opening-height",
        "opening",
        opening.id,
        `The opening "${opening.id}" is from the height ${show(sill / scale)} to ${show(top / scale)}. The wall "${opening.wall}" is from 0 to ${show(found.frame.height / scale)}.`,
      );
    }
    const list = holes.get(opening.wall) ?? [];
    list.push({ id: opening.id, from, to, sill, top });
    holes.set(opening.wall, list);
  }
  for (const [wall, list] of holes) {
    list.sort((a, b) => a.from - b.from);
    for (let i = 1; i < list.length; i++) {
      const before = list[i - 1]!;
      const hole = list[i]!;
      if (hole.from < before.to - SMALL) error("opening-overlap", "opening", hole.id, `The openings "${before.id}" and "${hole.id}" of the wall "${wall}" overlap.`);
    }
  }

  const circuitIds = new Set(circuits.map((circuit) => circuit.id));
  for (const outlet of outlets) {
    if (outlet.circuit !== undefined && !circuitIds.has(outlet.circuit)) error("outlet-circuit", "outlet", outlet.id, `The outlet "${outlet.id}" is on the circuit "${outlet.circuit}", which the room does not have.`);
    const found = frameOf.get(outlet.wall);
    if (found === undefined) {
      error("outlet-wall", "outlet", outlet.id, `The outlet "${outlet.id}" is on the wall "${outlet.wall}", which the room does not have.`);
      continue;
    }
    const along = outlet.offset * scale;
    const height = outlet.height * scale;
    if (!(along >= 0 && along <= found.frame.length + SMALL && height >= 0 && height <= found.frame.height + SMALL)) {
      error(
        "outlet-range",
        "outlet",
        outlet.id,
        `The outlet "${outlet.id}" is at ${show(outlet.offset)} along the wall "${outlet.wall}" and at the height ${show(outlet.height)}. The wall has the length ${show(found.frame.length / scale)} and the height ${show(found.frame.height / scale)}.`,
      );
      continue;
    }
    const hole = (holes.get(outlet.wall) ?? []).find((item) => along > item.from && along < item.to && height > item.sill && height < item.top);
    if (hole !== undefined) warning("outlet-in-opening", "outlet", outlet.id, `The outlet "${outlet.id}" is in the opening "${hole.id}" of the wall "${outlet.wall}".`);
  }

  for (const floor of floors) {
    if (floor.ring.length < 3 || !(regionArea({ kind: "polygon", points: floor.ring }) * scale * scale > SMALL * SMALL)) {
      error("floor-ring", "floor", floor.id, `The floor "${floor.id}" has no area. Its ring must have 3 or more corners that are not on one line.`);
    }
  }
  for (const circuit of circuits) {
    if (!(circuit.limit > 0)) error("circuit-limit", "circuit", circuit.id, `The limit of the circuit "${circuit.id}" is ${show(circuit.limit)} W. It must be above 0.`);
  }
  return findings;
}

/** The outline in the plan and the range of heights of a placed object, in meters. */
interface Extent {
  readonly object: PlacedObject;
  readonly ring: Ring;
  readonly z: number;
  readonly top: number;
}

/** This function gives the extent of a placed object from its transform. The turn of each object is about the vertical axis, so the outline is a rectangle. */
function extentOf(object: PlacedObject, transform: Transform3, scale: number): Extent {
  const w = (object.size[0] * scale) / 2;
  const h = (object.size[1] * scale) / 2;
  const corners: readonly (readonly [number, number])[] = [
    [0 - w, 0 - h],
    [w, 0 - h],
    [w, h],
    [0 - w, h],
  ];
  const ring = corners.map(([x, y]) => {
    const point = transformPoint3(transform, { x, y, z: 0 });
    return [point.x, point.y] as const;
  });
  return { object, ring, z: transform.position.z, top: transform.position.z + object.size[2] * scale };
}

/**
 * This function gives each fault of a scene record: the faults of its room, then the faults of its placed objects and its loads.
 * A scene with no finding of the level `error` gives a full model.
 */
export function checkScene(scene: Scene, options: CheckOptions = {}): readonly Finding[] {
  const findings: Finding[] = [...checkRoom(scene.room, options)];
  const error = (code: FindingCode, record: RecordKind, at: string, message: string): void => {
    findings.push({ level: "error", code, record, at, message });
  };
  const warning = (code: FindingCode, record: RecordKind, at: string, message: string): void => {
    findings.push({ level: "warning", code, record, at, message });
  };
  const room = scene.room;
  const scale = metersPer(room.unit);
  const objects = scene.objects ?? [];
  const byId = new Map(objects.map((object) => [object.id, object] as const));
  const outletIds = new Set((room.outlets ?? []).map((outlet) => outlet.id));
  const circuitIds = new Set((room.circuits ?? []).map((circuit) => circuit.id));
  /** This function tells if each size of an object is above 0 for the checks. */
  const hasSize = (object: PlacedObject): boolean => object.size.every((size) => size * scale > SMALL);

  for (const id of repeated(objects.map((object) => object.id))) error("id-duplicate", "object", id, `Two or more records of the kind object have the id "${id}".`);

  /** The objects that hold an object, from its parent up. A loop of parents gives `undefined`. */
  const holders = (object: PlacedObject): ReadonlySet<string> | undefined => {
    const seen = new Set<string>([object.id]);
    const above = new Set<string>();
    let parent = object.parent === undefined ? undefined : byId.get(object.parent);
    while (parent !== undefined) {
      if (seen.has(parent.id)) return undefined;
      seen.add(parent.id);
      above.add(parent.id);
      parent = parent.parent === undefined ? undefined : byId.get(parent.parent);
    }
    return above;
  };

  for (const object of objects) {
    if (holdsBadNumber(object)) error("number-not-finite", "object", object.id, `A number of the object "${object.id}" is not finite.`);
    // The turn of an object is an angle, so it has no such limit.
    if (holdsLargeNumber([object.size, object.at, object.lift], LARGEST_LENGTH / scale)) error("number-too-large", "object", object.id, `A length of the object "${object.id}" is above 1 000 km, the largest length of the model.`);
    if (!hasSize(object)) error("size-not-positive", "object", object.id, `The size of the object "${object.id}" is ${object.size.map(show).join(" by ")}. Each number must be above 0.`);
    if (object.parent !== undefined && !byId.has(object.parent)) error("object-parent", "object", object.id, `The object "${object.id}" is on the object "${object.parent}", which the scene does not have.`);
    else if (holders(object) === undefined) error("object-cycle", "object", object.id, `The parents of the object "${object.id}" make a loop.`);
    if (object.outlet !== undefined && !outletIds.has(object.outlet)) error("object-outlet", "object", object.id, `The object "${object.id}" uses the outlet "${object.outlet}", which the room does not have.`);
  }

  const transforms = objectTransforms(scene);
  const extents: Extent[] = [];
  for (const object of objects) {
    const transform = transforms.get(object.id);
    if (transform !== undefined && hasSize(object)) extents.push(extentOf(object, transform, scale));
  }

  const floors = (room.floors ?? []).filter((floor) => floor.ring.length >= 3).map((floor) => floor.ring.map(([x, y]) => [x * scale, y * scale] as const));
  const frames = wallFrames(room);
  const footprints = wallFootprints(frames, options.joins);
  for (const extent of extents) {
    const { object } = extent;
    const transform = transforms.get(object.id)!;
    if (object.parent === undefined && floors.length > 0 && !floors.some((ring) => pointInRing(transform.position.x, transform.position.y, ring))) {
      warning("object-outside", "object", object.id, `The center of the object "${object.id}" is not on a floor of the room.`);
    }
    footprints.forEach((footprint, index) => {
      if (footprint.ring.length < 3 || !(extent.z < frames[index]!.height - SMALL) || !(convexOverlap(footprint.ring, extent.ring) > SMALL)) return;
      warning("object-in-wall", "object", object.id, `The object "${object.id}" overlaps the wall "${footprint.wall}".`);
    });
  }
  for (let i = 0; i < extents.length; i++) {
    for (let j = i + 1; j < extents.length; j++) {
      const a = extents[i]!;
      const b = extents[j]!;
      if (holders(a.object)?.has(b.object.id) === true || holders(b.object)?.has(a.object.id) === true) continue;
      if (!(Math.min(a.top, b.top) - Math.max(a.z, b.z) > SMALL) || !(convexOverlap(a.ring, b.ring) > SMALL)) continue;
      warning("object-overlap", "object", a.object.id, `The objects "${a.object.id}" and "${b.object.id}" overlap.`);
    }
  }

  for (const load of scene.loads ?? []) {
    if (!circuitIds.has(load.circuit)) error("load-circuit", "load", load.circuit, `A load is on the circuit "${load.circuit}", which the room does not have.`);
    if (!(load.watts >= 0 && Number.isFinite(load.watts))) error("load-watts", "load", load.circuit, `A load of the circuit "${load.circuit}" is ${show(load.watts)} W. It must be a finite number, 0 or more.`);
  }
  return findings;
}
