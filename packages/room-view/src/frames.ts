import { rotationAbout, type Point, type Transform3 } from "@mark1russell7/layout-contract";
import type { Room, Wall } from "./room.ts";
import { lengthsInRange, metersPer } from "./units.ts";

/**
 * The frame of a wall, in meters. A point of the wall has a distance along the line and a distance across it.
 * The distance across is positive to the left, for a person who looks from the start to the end.
 */
export interface WallFrame {
  /** The `id` of the wall. */
  readonly id: string;
  readonly start: Point;
  readonly end: Point;
  /** The unit vector from the start to the end. A wall with the length 0, or with a length that is not finite, has the vector (1, 0). */
  readonly along: Point;
  /** The unit vector to the left of `along`. */
  readonly left: Point;
  readonly length: number;
  readonly thickness: number;
  readonly height: number;
  /** The distance across of the left face. It is 0 or more. */
  readonly leftOffset: number;
  /** The distance across of the right face. It is 0 or less. */
  readonly rightOffset: number;
}

/** This function gives the frame of one wall. `scale` is the length of the unit of the room in meters. */
function frameOf(room: Room, wall: Wall, scale: number): WallFrame {
  const start = { x: wall.from[0] * scale, y: wall.from[1] * scale };
  const end = { x: wall.to[0] * scale, y: wall.to[1] * scale };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const along = length > 0 && Number.isFinite(length) ? { x: (end.x - start.x) / length, y: (end.y - start.y) / length } : { x: 1, y: 0 };
  const thickness = (wall.thickness ?? room.wallThickness) * scale;
  const side = wall.side ?? "center";
  const leftOffset = side === "left" ? thickness : side === "right" ? 0 : thickness / 2;
  return {
    id: wall.id,
    start,
    end,
    along,
    left: { x: 0 - along.y, y: along.x },
    length,
    thickness,
    height: (wall.height ?? room.height) * scale,
    leftOffset,
    rightOffset: leftOffset - thickness,
  };
}

/** This function gives the frame of each wall of a room, in the sequence of the walls. */
export function wallFrames(room: Room): readonly WallFrame[] {
  const scale = metersPer(room.unit);
  return room.walls.map((wall) => frameOf(room, wall, scale));
}

/**
 * This function tells if a wall has an outline in the plan. Its ends and its thickness must be lengths in the range of the model,
 * and its length and its thickness must be above 0. Only such a wall makes a corner, and the model makes only such a wall.
 */
export function wallHasOutline(frame: WallFrame): boolean {
  return lengthsInRange(frame.start.x, frame.start.y, frame.end.x, frame.end.y, frame.thickness) && frame.length > 0 && frame.thickness > 0;
}

/** This function gives the point of the plan at a distance along a wall and a distance across it, in meters. */
export function wallPoint(frame: WallFrame, along: number, across: number): Point {
  return {
    x: frame.start.x + frame.along.x * along + frame.left.x * across,
    y: frame.start.y + frame.along.y * along + frame.left.y * across,
  };
}

/**
 * This function gives the transform from the frame of a wall to the room.
 * In the frame of a wall, x is the distance along the wall and y is the distance across it. The height above the floor is z.
 */
export function wallTransform(frame: WallFrame): Transform3 {
  return {
    position: { x: frame.start.x, y: frame.start.y, z: 0 },
    rotation: rotationAbout({ x: 0, y: 0, z: 1 }, Math.atan2(frame.along.y, frame.along.x)),
  };
}
