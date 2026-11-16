import { pointInRing, type Point, type Point3, type Ring } from "@mark1russell7/layout-contract";
import { wallFrames, wallHasOutline, wallPoint, type WallFrame } from "../frames.ts";
import type { Room } from "../room.ts";
import { metersPer } from "../units.ts";

/** The side of a wall that looks at the room. A wall between two parts of a room has the value `both`. */
export type InnerSide = "left" | "right" | "both";

/** A wall, and the side of it that looks at the room. */
export interface WallShade {
  readonly frame: WallFrame;
  readonly inner: InnerSide;
}

/** The distance from a face of a wall to the points that find the floor, in meters. */
const PROBE = 0.05;

/** A wall hides the room when it hides a strip of the floor that is deeper than this, in meters. */
export const HIDDEN_LIMIT = 0.3;

/** This function gives the distance of a point of the plan across a wall. It is positive to the left of the line of the wall. */
function across(frame: WallFrame, point: Point): number {
  return (point.x - frame.start.x) * frame.left.x + (point.y - frame.start.y) * frame.left.y;
}

/** This function tells if a floor is next to one face of a wall. `offset` is the distance across of points near that face. */
function hasFloor(frame: WallFrame, offset: number, floors: readonly Ring[]): boolean {
  return [0.25, 0.5, 0.75].some((part) => {
    const point = wallPoint(frame, frame.length * part, offset);
    return floors.some((ring) => pointInRing(point.x, point.y, ring));
  });
}

/**
 * This function gives each wall that the model makes, with the side that looks at the room.
 *
 * A side looks at the room when a floor is next to it. For a wall with no floor on each side, the side is the side of `center`,
 * a point of the plan in meters. Without a center, such a wall has the value `both`.
 */
export function wallShades(room: Room, center?: Point): readonly WallShade[] {
  const scale = metersPer(room.unit);
  const floors = (room.floors ?? []).map((floor): Ring => floor.ring.map(([x, y]) => [x * scale, y * scale] as const));
  return wallFrames(room)
    .filter((frame) => wallHasOutline(frame))
    .map((frame): WallShade => {
      const left = hasFloor(frame, frame.leftOffset + PROBE, floors);
      const right = hasFloor(frame, frame.rightOffset - PROBE, floors);
      if (left !== right) return { frame, inner: left ? "left" : "right" };
      if (left || center === undefined) return { frame, inner: "both" };
      const side = across(frame, center);
      return { frame, inner: side > frame.leftOffset ? "left" : side < frame.rightOffset ? "right" : "both" };
    });
}

/**
 * This function gives the depth of the strip of the floor that a wall hides from a camera, in meters.
 *
 * `camera` is a point of the room in meters, with the z axis up. A camera above the wall, between its two faces, hides no strip.
 * A camera that is not above the top of the wall hides all of the floor behind the wall, and the depth is `Infinity`.
 */
export function hiddenDepth(frame: WallFrame, camera: Point3): number {
  const side = across(frame, camera);
  const gap = side > frame.leftOffset ? side - frame.leftOffset : side < frame.rightOffset ? frame.rightOffset - side : 0;
  if (!(gap > 0)) return 0;
  return camera.z > frame.height ? (frame.height * gap) / (camera.z - frame.height) : Infinity;
}

/**
 * This function gives the `id` of each wall that hides the room from a camera. A viewer makes these walls almost clear.
 *
 * A wall with one side to the room hides the room when the camera is on its other side.
 * A wall between two parts of a room hides the part behind it from each side.
 * `limit` is the depth of the hidden strip of the floor, in meters, above which a wall hides the room.
 */
export function hidingWalls(shades: readonly WallShade[], camera: Point3, limit: number = HIDDEN_LIMIT): ReadonlySet<string> {
  const hiding = new Set<string>();
  for (const { frame, inner } of shades) {
    const side = across(frame, camera);
    const cameraSide = side > frame.leftOffset ? "left" : side < frame.rightOffset ? "right" : undefined;
    if (cameraSide === undefined || cameraSide === inner) continue;
    if (hiddenDepth(frame, camera) > limit) hiding.add(frame.id);
  }
  return hiding;
}
