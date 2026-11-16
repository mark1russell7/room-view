import { clipRing, type Point, type Ring } from "@mark1russell7/layout-contract";
import { wallHasOutline, wallPoint, type WallFrame } from "./frames.ts";

/** The outline of one wall in the plan, after its corners with the other walls. */
export interface WallFootprint {
  /** The `id` of the wall. */
  readonly wall: string;
  /** The outline in meters, counter-clockwise and convex. It is empty for a wall with no outline (`wallHasOutline`) and for a wall that its corners remove. */
  readonly ring: Ring;
  /**
   * The part of the wall that has its full thickness: two distances along the wall, in meters.
   * An opening must be in this part. A wall with no such part has the two distances 0.
   */
  readonly clear: readonly [number, number];
}

/** The options of the corners of the walls. */
export interface JoinOptions {
  /** Two ends of walls at this distance or less make one corner. The unit is the meter, and the default is 1e-6. A value that is not finite gives the default. */
  readonly tolerance?: number | undefined;
  /**
   * The limit of a sharp corner. The faces of two walls meet at a point. When that point is farther from the corner
   * than this number of thicknesses, the two walls get square ends. The default is 4. A value that is not finite gives the default.
   */
  readonly miterLimit?: number | undefined;
}

/** The default distance in meters at which two ends of walls make one corner. */
export const JOIN_TOLERANCE = 1e-6;

/** The default limit of a sharp corner, in thicknesses. */
export const MITER_LIMIT = 4;

/** Two unit vectors with a cross product below this value are parallel. */
const PARALLEL = 1e-9;

/** A corner of an outline with a turn of this value or less is flat, so the outline does not need it. */
const FLAT = 1e-12;

/** Two points at this distance or less are one point. A point at this distance or less from a face of a wall is on the face. */
const SAME = 1e-9;

/**
 * One end of a wall, as a person at the end sees it who looks along the wall.
 * `high` and `low` are the distances of the two faces along `normal`, the unit vector to the left of `out`.
 */
interface End {
  readonly point: Point;
  readonly out: Point;
  readonly normal: Point;
  readonly high: number;
  readonly low: number;
  readonly thickness: number;
  /** The points of the two faces at this end. The corners of the walls replace the square points. */
  highPoint: Point;
  lowPoint: Point;
  /** This value tells if the end makes a corner with a different end. */
  joined: boolean;
}

/** This function gives an option, or its default when the option has no value or a value that is not finite. */
function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** This function gives the point at a distance across from the point of an end. */
function across(end: End, distance: number): Point {
  return { x: end.point.x + end.normal.x * distance, y: end.point.y + end.normal.y * distance };
}

/** This function makes the two ends of a wall, with square points. */
function endsOf(frame: WallFrame): readonly [End, End] {
  const back = { x: 0 - frame.along.x, y: 0 - frame.along.y };
  const right = { x: 0 - frame.left.x, y: 0 - frame.left.y };
  const make = (point: Point, out: Point, normal: Point, high: number, low: number): End => {
    const end: End = { point, out, normal, high, low, thickness: frame.thickness, highPoint: point, lowPoint: point, joined: false };
    end.highPoint = across(end, high);
    end.lowPoint = across(end, low);
    return end;
  };
  return [
    make(frame.start, frame.along, frame.left, frame.leftOffset, frame.rightOffset),
    make(frame.end, back, right, 0 - frame.rightOffset, 0 - frame.leftOffset),
  ];
}

/** This function gives the point where two lines meet, or `undefined` for parallel lines. Each line has a point and a unit direction. */
function meet(p: Point, d: Point, q: Point, e: Point): Point | undefined {
  const cross = d.x * e.y - d.y * e.x;
  if (Math.abs(cross) < PARALLEL) return undefined;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / cross;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

/**
 * This function makes the corner of the ends at one point. The ends are in sequence counter-clockwise.
 * The left face of each end meets the right face of the next end.
 */
function joinEnds(ends: readonly End[], miterLimit: number): void {
  if (ends.length < 2) return;
  for (let i = 0; i < ends.length; i++) {
    const end = ends[i]!;
    const next = ends[(i + 1) % ends.length]!;
    end.joined = true;
    const corner = meet(across(end, end.high), end.out, across(next, next.low), next.out);
    if (corner === undefined) continue;
    const reach = Math.hypot(corner.x - end.point.x, corner.y - end.point.y);
    if (reach > miterLimit * Math.max(end.thickness, next.thickness)) continue;
    end.highPoint = corner;
    next.lowPoint = corner;
  }
}

/** This function gives the part of a ring to the left of the line from `p` to `q`. Two points at one position give the full ring. */
function leftOf(ring: Ring, p: Point, q: Point): Ring {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  if (length <= SAME) return ring;
  const dx = (q.x - p.x) / length;
  const dy = (q.y - p.y) / length;
  return clipRing(ring, dy, 0 - dx, dy * p.x - dx * p.y);
}

/**
 * This function cuts the outline of a wall at one end. An end with no corner gets a square cut.
 * An end with a corner keeps the part between the two lines from the point of the corner to the points of the two faces.
 */
function cut(ring: Ring, end: End): Ring {
  if (!end.joined) return leftOf(ring, end.highPoint, end.lowPoint);
  return leftOf(leftOf(ring, end.highPoint, end.point), end.point, end.lowPoint);
}

/** This function removes each corner of a convex outline that is flat or that is a copy of the corner before it. Fewer than 3 corners give an empty outline. */
function withoutFlat(points: Ring): Ring {
  const ring = [...points];
  let changed = true;
  while (changed && ring.length >= 3) {
    changed = false;
    for (let i = 0; i < ring.length && ring.length >= 3; i++) {
      const [ax, ay] = ring[(i + ring.length - 1) % ring.length]!;
      const [bx, by] = ring[i]!;
      const [cx, cy] = ring[(i + 1) % ring.length]!;
      if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) > FLAT) continue;
      ring.splice(i, 1);
      changed = true;
      i--;
    }
  }
  return ring.length >= 3 ? ring : [];
}

/** This function gives the range of the distances along a wall of the corners of an outline that are on one face. */
function faceRange(frame: WallFrame, ring: Ring, offset: number): readonly [number, number] {
  let from = Infinity;
  let to = -Infinity;
  for (const [x, y] of ring) {
    const dx = x - frame.start.x;
    const dy = y - frame.start.y;
    if (Math.abs(dx * frame.left.x + dy * frame.left.y - offset) > SAME) continue;
    const along = dx * frame.along.x + dy * frame.along.y;
    from = Math.min(from, along);
    to = Math.max(to, along);
  }
  return [from, to];
}

/**
 * This function gives the outline of each wall in the plan, in the sequence of the frames.
 *
 * Two or more ends of walls at one point make a corner. At a corner, the faces of the walls that are adjacent meet at a point.
 * Each wall ends at the lines from the corner to those points. Thus two walls make a miter, and the walls of a corner do not overlap.
 * An end with no other end at its point is square. An end on the face of a different wall is also square: the two walls touch.
 * A wall with no outline (`wallHasOutline`) gets an empty outline, and it makes no corner.
 */
export function wallFootprints(frames: readonly WallFrame[], options: JoinOptions = {}): readonly WallFootprint[] {
  const tolerance = finiteOr(options.tolerance, JOIN_TOLERANCE);
  const miterLimit = Math.max(finiteOr(options.miterLimit, MITER_LIMIT), 0);
  const pairs = frames.map((frame) => (wallHasOutline(frame) ? endsOf(frame) : undefined));
  const corners: End[][] = [];
  for (const pair of pairs) {
    for (const end of pair ?? []) {
      const corner = corners.find((ends) => Math.hypot(ends[0]!.point.x - end.point.x, ends[0]!.point.y - end.point.y) <= tolerance);
      if (corner === undefined) corners.push([end]);
      else corner.push(end);
    }
  }
  for (const ends of corners) {
    ends.sort((a, b) => Math.atan2(a.out.y, a.out.x) - Math.atan2(b.out.y, b.out.x));
    joinEnds(ends, miterLimit);
  }
  const thickest = frames.reduce((most, frame, index) => (pairs[index] === undefined ? most : Math.max(most, frame.thickness)), 0);
  const reach = (miterLimit + 1) * thickest;
  return frames.map((frame, index): WallFootprint => {
    const pair = pairs[index];
    if (pair === undefined) return { wall: frame.id, ring: [], clear: [0, 0] };
    const strip = [
      wallPoint(frame, 0 - reach, frame.rightOffset),
      wallPoint(frame, frame.length + reach, frame.rightOffset),
      wallPoint(frame, frame.length + reach, frame.leftOffset),
      wallPoint(frame, 0 - reach, frame.leftOffset),
    ].map((point) => [point.x, point.y] as const);
    const ring = withoutFlat(cut(cut(strip, pair[0]), pair[1]));
    // A very large limit of a sharp corner can make numbers that are not finite. Such an outline is no outline.
    if (!ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return { wall: frame.id, ring: [], clear: [0, 0] };
    const leftFace = faceRange(frame, ring, frame.leftOffset);
    const rightFace = faceRange(frame, ring, frame.rightOffset);
    const from = Math.max(leftFace[0], rightFace[0]);
    const to = Math.min(leftFace[1], rightFace[1]);
    return { wall: frame.id, ring, clear: from < to ? [from, to] : [0, 0] };
  });
}
