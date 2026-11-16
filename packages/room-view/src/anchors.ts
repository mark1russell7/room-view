import { length3, rotatePoint3, scalePoint3, transformPoint3, type Point3, type Transform3 } from "@mark1russell7/layout-contract";
import { wallFrames, wallPoint, type WallFrame } from "./frames.ts";
import type { PlacedObject, PlanPoint, Scene, WallFace } from "./room.ts";
import { objectTransforms } from "./solids.ts";
import { lengthsInRange, metersPer } from "./units.ts";

// The anchors of the core: the places where an add-on puts its records. The core gives each anchor its position.
// An anchor names no topic. An outlet, a tap and a lamp are records of add-ons, and each one is on an anchor.

/** These are the surfaces that an anchor can be on. */
export const ANCHOR_SURFACES: readonly ["wall", "floor", "ceiling", "object"] = ["wall", "floor", "ceiling", "object"];

/** A surface of an anchor. */
export type AnchorSurface = (typeof ANCHOR_SURFACES)[number];

/** An anchor on a face of a wall. The lengths are in the unit of the room. */
export interface WallAnchor {
  readonly on: "wall";
  /** The `id` of the wall. */
  readonly wall: string;
  readonly face: WallFace;
  /** The distance along the line of the wall, from `from` to the anchor. */
  readonly offset: number;
  /** The height of the anchor above the floor. */
  readonly height: number;
}

/** An anchor on the floor, at a point of the plan. */
export interface FloorAnchor {
  readonly on: "floor";
  readonly at: PlanPoint;
  /** The `id` of the floor that has the point. Without it, the point is on any floor of the room. */
  readonly floor?: string | undefined;
}

/** An anchor on the ceiling, above a point of the plan. The ceiling is at the height of the room. */
export interface CeilingAnchor {
  readonly on: "ceiling";
  readonly at: PlanPoint;
  /** The `id` of the floor below the point. Without it, the point is above any floor of the room. */
  readonly floor?: string | undefined;
}

/**
 * An anchor on a placed object. The point and the direction are in the frame of the object, before its turn.
 * The origin of that frame is the center of the bottom of the object.
 */
export interface ObjectAnchor {
  readonly on: "object";
  /** The `id` of the placed object. */
  readonly object: string;
  /** The point in the frame of the object. The default is the center of its top. */
  readonly at?: readonly [number, number, number] | undefined;
  /** The direction out of the surface, in the frame of the object. The default is up: `[0, 0, 1]`. */
  readonly out?: readonly [number, number, number] | undefined;
}

/** An anchor: a place in the space of the core, for a record of an add-on. */
export type Anchor = WallAnchor | FloorAnchor | CeilingAnchor | ObjectAnchor;

/** The position of an anchor in the room, in meters. */
export interface AnchorFrame {
  /** The point of the anchor. */
  readonly at: Point3;
  /** The unit vector out of the surface, into the space of the room. */
  readonly out: Point3;
}

/**
 * The space of a scene, for the add-ons. It reads each wall, object and anchor of the scene.
 * Make it once with `sceneSpace`, and give it to each add-on.
 */
export interface SceneSpace {
  readonly scene: Scene;
  /** The length of the unit of the room, in meters. */
  readonly scale: number;
  /** This function gives the frame of a wall in meters, or `undefined` when the room does not have the wall. */
  readonly wall: (id: string) => WallFrame | undefined;
  /** This function gives a placed object of the scene, or `undefined` when the scene does not have it. */
  readonly object: (id: string) => PlacedObject | undefined;
  /** This function gives the transform of a placed object in meters, or `undefined` when the object has no place. */
  readonly transform: (id: string) => Transform3 | undefined;
  /** This function gives the position of an anchor, or `undefined` when the anchor has no position. `checkAnchor` tells the reason. */
  readonly frame: (anchor: Anchor) => AnchorFrame | undefined;
}

const UP: Point3 = { x: 0, y: 0, z: 1 };
const DOWN: Point3 = { x: 0, y: 0, z: -1 };

/** This function tells if each value of a point is a length in the range of the model. */
function inRange(point: Point3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z) && lengthsInRange(point.x, point.y, point.z);
}

/** This function gives a point with no negative zero. JSON has no negative zero, so a frame goes through JSON with no change. */
function plainPoint(point: Point3): Point3 {
  return { x: point.x + 0, y: point.y + 0, z: point.z + 0 };
}

/** This function gives the space of a scene. The transforms of the objects are calculated one time, at the first use. */
export function sceneSpace(scene: Scene): SceneSpace {
  const scale = metersPer(scene.room.unit);
  const walls = new Map(wallFrames(scene.room).map((frame) => [frame.id, frame] as const));
  const objects = new Map((scene.objects ?? []).map((object) => [object.id, object] as const));
  let transforms: ReadonlyMap<string, Transform3> | undefined;
  const transform = (id: string): Transform3 | undefined => {
    transforms ??= objectTransforms(scene);
    return transforms.get(id);
  };
  const frame = (anchor: Anchor): AnchorFrame | undefined => {
    let found: AnchorFrame;
    if (anchor.on === "wall") {
      const wall = walls.get(anchor.wall);
      if (wall === undefined) return undefined;
      const point = wallPoint(wall, anchor.offset * scale, anchor.face === "left" ? wall.leftOffset : wall.rightOffset);
      const sign = anchor.face === "left" ? 1 : -1;
      found = { at: { x: point.x, y: point.y, z: anchor.height * scale }, out: { x: wall.left.x * sign, y: wall.left.y * sign, z: 0 } };
    } else if (anchor.on === "floor") {
      found = { at: { x: anchor.at[0] * scale, y: anchor.at[1] * scale, z: 0 }, out: UP };
    } else if (anchor.on === "ceiling") {
      found = { at: { x: anchor.at[0] * scale, y: anchor.at[1] * scale, z: scene.room.height * scale }, out: DOWN };
    } else {
      const object = objects.get(anchor.object);
      const place = transform(anchor.object);
      if (object === undefined || place === undefined) return undefined;
      const [x, y, z] = anchor.at ?? [0, 0, object.size[2]];
      const [ox, oy, oz] = anchor.out ?? [0, 0, 1];
      const out = { x: ox, y: oy, z: oz };
      const size = length3(out);
      if (!(size > 0) || !Number.isFinite(size)) return undefined;
      found = { at: transformPoint3(place, { x: x * scale, y: y * scale, z: z * scale }), out: rotatePoint3(place.rotation, scalePoint3(out, 1 / size)) };
    }
    const plain: AnchorFrame = { at: plainPoint(found.at), out: plainPoint(found.out) };
    return inRange(plain.at) && inRange(plain.out) ? plain : undefined;
  };
  return { scene, scale, wall: (id) => walls.get(id), object: (id) => objects.get(id), transform, frame };
}
