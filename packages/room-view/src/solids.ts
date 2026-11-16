import {
  boundsOf3,
  box3Corners,
  box3Volume,
  clipRing,
  composeTransforms3,
  regionArea,
  rotationAbout,
  transformPoint3,
  type Box3,
  type Point3,
  type Ring,
  type Transform3,
} from "@mark1russell7/layout-contract";
import { wallFrames, wallHasOutline, wallTransform, type WallFrame } from "./frames.ts";
import { wallFootprints, type JoinOptions, type WallFootprint } from "./joins.ts";
import type { OpeningKind, PlacedObject, Room, Scene } from "./room.ts";
import { LARGEST_LENGTH, lengthsInRange, metersPer } from "./units.ts";

/** These are the kinds of a solid. */
export const SOLID_KINDS: readonly ["floor", "wall", "glass", "outlet", "object"] = ["floor", "wall", "glass", "outlet", "object"];

/** A kind of solid. */
export type SolidKind = (typeof SOLID_KINDS)[number];

/** A prism: an outline in the plan, from the height `z` up by `d`. The unit is the meter. */
export interface Prism {
  readonly kind: "prism";
  readonly ring: Ring;
  readonly z: number;
  readonly d: number;
}

/** A placed box: a box in its own frame, and the transform from that frame to the room. The unit is the meter. */
export interface PlacedBox {
  readonly kind: "box";
  readonly box: Box3;
  readonly transform: Transform3;
}

/** The shape of a solid. */
export type SolidShape = Prism | PlacedBox;

/**
 * A solid: one part of the 3D model of a room. The x and y axes are the axes of the plan, and the z axis points up.
 * The floor is at the height 0, and each length is in meters. Each number of a solid is finite, and its volume is above 0.
 */
export interface Solid {
  /** The name of the solid. Each solid of a model has a different name. */
  readonly id: string;
  readonly kind: SolidKind;
  /** The `id` of the record that the solid comes from: a wall, a floor, an opening, an outlet or a placed object. */
  readonly source: string;
  readonly shape: SolidShape;
}

/** The options of the model of a room. */
export interface SolidOptions {
  /** The depth of the floor below the height 0, in meters. The walls go down by the same depth. The default is 0.1. A value that is not finite gives the default. */
  readonly floorDepth?: number | undefined;
  /** The options of the corners of the walls. */
  readonly joins?: JoinOptions | undefined;
}

/** The default depth of the floor, in meters. */
export const FLOOR_DEPTH = 0.1;

/** The thickness of the glass of a window, in meters. */
export const GLASS_THICKNESS = 0.02;

/** The size of the plate of an outlet, in meters. The plate of a duplex outlet in North America is 70 mm by 115 mm. */
export const OUTLET_PLATE: { readonly width: number; readonly height: number; readonly depth: number } = { width: 0.07, height: 0.115, depth: 0.012 };

/**
 * The transform from the room, where the z axis points up, to a space where the y axis points up.
 * The glTF format and three.js have the y axis up. The x axis stays, and the y axis of the plan becomes the negative z axis.
 */
export const TO_Y_UP: Transform3 = { position: { x: 0, y: 0, z: 0 }, rotation: { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 } };

/** A length in meters at this value or less is empty: the model does not make a part of this size. */
const EMPTY = 1e-9;

/** An area in square meters at this value or less is empty. */
const EMPTY_AREA = 1e-12;

/** This function gives an outline, or an empty ring when the outline has no area or a number that is not finite. */
function solidRing(ring: Ring): Ring {
  if (ring.length < 3 || !ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return [];
  return regionArea({ kind: "polygon", points: ring }) > EMPTY_AREA ? ring : [];
}

/** This function tells if the model makes a wall. Such a wall has an outline in the plan, and its height is above 0 and in the range of the model. */
function isMade(frame: WallFrame): boolean {
  return wallHasOutline(frame) && frame.height > 0 && lengthsInRange(frame.height);
}

/** An opening of a wall, in meters, in the frame of the wall. */
interface Hole {
  readonly id: string;
  readonly kind: OpeningKind;
  readonly from: number;
  readonly to: number;
  readonly sill: number;
  readonly top: number;
}

/**
 * This function gives the openings of one wall that the model can make, in sequence along the wall.
 * It skips an opening with no size and an opening out of the straight part of the wall. It also skips an opening that overlaps the opening before it.
 */
function holesOf(room: Room, frame: WallFrame, footprint: WallFootprint, scale: number): readonly Hole[] {
  const [clearFrom, clearTo] = footprint.clear;
  const holes = (room.openings ?? [])
    .filter((opening) => opening.wall === frame.id)
    .map((opening): Hole => {
      const sill = (opening.sill ?? 0) * scale;
      return {
        id: opening.id,
        kind: opening.kind,
        from: opening.offset * scale,
        to: (opening.offset + opening.width) * scale,
        sill,
        top: Math.min(sill + opening.height * scale, frame.height),
      };
    })
    .filter((hole) => hole.to - hole.from > EMPTY && hole.sill >= 0 && hole.top - hole.sill > EMPTY && hole.from >= clearFrom - EMPTY && hole.to <= clearTo + EMPTY)
    .sort((a, b) => a.from - b.from);
  const kept: Hole[] = [];
  let cursor = -Infinity;
  for (const hole of holes) {
    if (hole.from < cursor - EMPTY) continue;
    kept.push(hole);
    cursor = hole.to;
  }
  return kept;
}

/** This function removes each corner of a ring that is at the position of the corner before it. */
function withoutRepeats(ring: Ring): Ring {
  return ring.filter(([x, y], index) => {
    const [px, py] = ring[(index + ring.length - 1) % ring.length]!;
    return ring.length === 1 || Math.hypot(x - px, y - py) > EMPTY;
  });
}

/** This function gives the part of the outline of a wall between two distances along the wall. An empty part gives an empty ring. */
function slice(frame: WallFrame, ring: Ring, from: number, to: number): Ring {
  const base = frame.start.x * frame.along.x + frame.start.y * frame.along.y;
  let part = ring;
  if (Number.isFinite(from)) part = clipRing(part, 0 - frame.along.x, 0 - frame.along.y, 0 - (base + from));
  if (Number.isFinite(to)) part = clipRing(part, frame.along.x, frame.along.y, base + to);
  return solidRing(withoutRepeats(part));
}

/** This function gives the solids of one wall: the parts between, below and above its openings, and the glass of each window. */
function wallSolids(room: Room, frame: WallFrame, footprint: WallFootprint, scale: number, depth: number): readonly Solid[] {
  if (footprint.ring.length < 3 || !isMade(frame)) return [];
  const walls: Solid[] = [];
  const glass: Solid[] = [];
  const add = (ring: Ring, z: number, top: number): void => {
    if (ring.length < 3 || top - z <= EMPTY) return;
    walls.push({ id: `wall:${frame.id}:${String(walls.length)}`, kind: "wall", source: frame.id, shape: { kind: "prism", ring, z, d: top - z } });
  };
  let cursor = -Infinity;
  for (const hole of holesOf(room, frame, footprint, scale)) {
    add(slice(frame, footprint.ring, cursor, hole.from), 0 - depth, frame.height);
    const part = slice(frame, footprint.ring, hole.from, hole.to);
    add(part, 0 - depth, hole.sill);
    add(part, hole.top, frame.height);
    cursor = hole.to;
    if (hole.kind !== "window") continue;
    glass.push({
      id: `glass:${hole.id}`,
      kind: "glass",
      source: hole.id,
      shape: {
        kind: "box",
        box: {
          x: hole.from,
          y: (frame.leftOffset + frame.rightOffset - GLASS_THICKNESS) / 2,
          z: hole.sill,
          w: hole.to - hole.from,
          h: GLASS_THICKNESS,
          d: hole.top - hole.sill,
        },
        transform: wallTransform(frame),
      },
    });
  }
  add(slice(frame, footprint.ring, cursor, Infinity), 0 - depth, frame.height);
  return [...walls, ...glass];
}

/**
 * This function gives the 3D model of a room as a list of solids.
 * The solids are the floors, the walls with their openings, the glass of the windows and the outlets.
 *
 * The function does not stop for a record with a fault. It skips each part that it cannot make.
 * One example is a wall with no length. A second example is an opening on a wall that the room does not have.
 * A third example is a part with a number that is not finite or not in the range of the model (`LARGEST_LENGTH`). `checkRoom` tells each fault.
 */
export function roomSolids(room: Room, options: SolidOptions = {}): readonly Solid[] {
  const scale = metersPer(room.unit);
  const given = options.floorDepth ?? FLOOR_DEPTH;
  const depth = Number.isFinite(given) ? Math.min(Math.max(given, 0), LARGEST_LENGTH) : FLOOR_DEPTH;
  const frames = wallFrames(room);
  const footprints = wallFootprints(frames, options.joins);
  const solids: Solid[] = [];
  for (const floor of room.floors ?? []) {
    const ring = solidRing(floor.ring.map(([x, y]) => [x * scale, y * scale] as const));
    if (ring.length < 3 || depth <= EMPTY || !ring.every(([x, y]) => lengthsInRange(x, y))) continue;
    solids.push({ id: `floor:${floor.id}`, kind: "floor", source: floor.id, shape: { kind: "prism", ring, z: 0 - depth, d: depth } });
  }
  frames.forEach((frame, index) => {
    solids.push(...wallSolids(room, frame, footprints[index]!, scale, depth));
  });
  const byId = new Map(frames.map((frame) => [frame.id, frame] as const));
  for (const outlet of room.outlets ?? []) {
    const frame = byId.get(outlet.wall);
    if (frame === undefined || !isMade(frame)) continue;
    const along = outlet.offset * scale;
    const height = outlet.height * scale;
    if (!lengthsInRange(along, height)) continue;
    solids.push({
      id: `outlet:${outlet.id}`,
      kind: "outlet",
      source: outlet.id,
      shape: {
        kind: "box",
        box: {
          x: along - OUTLET_PLATE.width / 2,
          y: outlet.face === "left" ? frame.leftOffset : frame.rightOffset - OUTLET_PLATE.depth,
          z: height - OUTLET_PLATE.height / 2,
          w: OUTLET_PLATE.width,
          h: OUTLET_PLATE.depth,
          d: OUTLET_PLATE.height,
        },
        transform: wallTransform(frame),
      },
    });
  }
  return solids;
}

/**
 * This function gives the transform of each placed object of a scene, from the frame of the object to the room, in meters.
 * The origin of the frame of an object is the center of its bottom. An object with a parent gets the transform of the parent first.
 * An object has no transform when a parent is not in the scene, or when its parents make a loop.
 * An object also has no transform when one value of its place is not finite or not in the range of the model.
 */
export function objectTransforms(scene: Scene): ReadonlyMap<string, Transform3> {
  const scale = metersPer(scene.room.unit);
  const objects = new Map((scene.objects ?? []).map((object) => [object.id, object] as const));
  const done = new Map<string, Transform3>();
  const open = new Set<string>();
  const resolve = (object: PlacedObject): Transform3 | undefined => {
    const known = done.get(object.id);
    if (known !== undefined) return known;
    if (open.has(object.id)) return undefined;
    const turn = object.turn ?? 0;
    const position = { x: object.at[0] * scale, y: object.at[1] * scale, z: (object.lift ?? 0) * scale };
    if (!Number.isFinite(turn) || !lengthsInRange(position.x, position.y, position.z)) return undefined;
    // The remainder is exact. Thus a very large turn does not make an angle that is not finite.
    const local: Transform3 = { position, rotation: rotationAbout({ x: 0, y: 0, z: 1 }, ((turn % 360) * Math.PI) / 180) };
    let world: Transform3 | undefined = local;
    if (object.parent !== undefined) {
      open.add(object.id);
      const parent = objects.get(object.parent);
      const outer = parent === undefined ? undefined : resolve(parent);
      world = outer === undefined ? undefined : composeTransforms3(outer, local);
      open.delete(object.id);
    }
    if (world !== undefined) done.set(object.id, world);
    return world;
  };
  for (const object of scene.objects ?? []) resolve(object);
  return done;
}

/**
 * This function gives the 3D model of a scene: the solids of its room, then one box for each placed object.
 * It skips an object that has no transform, no size, or a size that is not in the range of the model. `checkScene` tells each fault.
 */
export function sceneSolids(scene: Scene, options: SolidOptions = {}): readonly Solid[] {
  const scale = metersPer(scene.room.unit);
  const transforms = objectTransforms(scene);
  const solids: Solid[] = [...roomSolids(scene.room, options)];
  for (const object of scene.objects ?? []) {
    const transform = transforms.get(object.id);
    const w = object.size[0] * scale;
    const h = object.size[1] * scale;
    const d = object.size[2] * scale;
    if (transform === undefined || ![w, h, d].every((size) => size > EMPTY && size <= LARGEST_LENGTH)) continue;
    solids.push({
      id: `object:${object.id}`,
      kind: "object",
      source: object.id,
      shape: { kind: "box", box: { x: 0 - w / 2, y: 0 - h / 2, z: 0, w, h, d }, transform },
    });
  }
  return solids;
}

/** This function gives the corners of a solid in the room. A box has 8, and a prism has 2 for each corner of its outline. */
export function solidCorners(solid: Solid): readonly Point3[] {
  const shape = solid.shape;
  if (shape.kind === "box") return box3Corners(shape.box).map((corner) => transformPoint3(shape.transform, corner));
  return shape.ring.flatMap(([x, y]) => [
    { x, y, z: shape.z },
    { x, y, z: shape.z + shape.d },
  ]);
}

/** This function gives the smallest box along the axes that holds each solid, or `undefined` for no solids. */
export function boundsOfSolids(solids: readonly Solid[]): Box3 | undefined {
  return boundsOf3(solids.flatMap((solid) => solidCorners(solid)));
}

/** This function gives the volume of a solid in cubic meters. */
export function solidVolume(solid: Solid): number {
  const shape = solid.shape;
  return shape.kind === "box" ? box3Volume(shape.box) : regionArea({ kind: "polygon", points: shape.ring }) * shape.d;
}
